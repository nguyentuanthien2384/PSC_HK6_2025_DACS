const { Transaction } = require('sequelize');
const { fail, positiveInteger, money, resultOf } = require('../utils/commerce');
const { recordOrderEvent } = require('./orderEventService');

const validId = value => ['number', 'string'].includes(typeof value) && positiveInteger(value);
const sameId = (left, right) => validId(left) && validId(right) && Number(left) === Number(right);
const isAdmin = actor => !!actor && ['R1', 'R4'].includes(actor.roleId);
const plain = model => model && model.get ? model.get({ plain: true }) : model;
const text = (value, name, max = 1000, required = true) => {
    if (value === undefined && !required) return '';
    if (typeof value !== 'string' || value.trim().length > max || (required && value.trim().length < 3)) fail(`${name} phải có từ 3 đến ${max} ký tự.`);
    return value.trim();
};
function validateEvidence(value, required = false) {
    if ((value === undefined || value === '') && !required) return null;
    if (typeof value !== 'string' || value.length > 8 * 1024 * 1024) fail('Minh chứng phải là ảnh tối đa 6 MB hoặc liên kết HTTPS.');
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z\d+/=\r\n]+$/i.test(value)) return value;
    try {
        const url = new URL(value);
        if (value.length <= 2048 && url.protocol === 'https:' && !url.username && !url.password) return url.href;
    } catch (_) { /* Invalid evidence stays a validation error. */ }
    fail('Minh chứng phải là ảnh PNG, JPEG, WebP, GIF hoặc liên kết HTTPS.');
}
const returnWindowDays = () => {
    const days = Number(process.env.RETURN_WINDOW_DAYS || 7);
    return Number.isInteger(days) && days >= 1 && days <= 90 ? days : 7;
};
function evaluateReturnEligibility(order, actor, request, address, now = new Date()) {
    const windowDays = returnWindowDays();
    const delivered = order && order.deliveredAt ? new Date(order.deliveredAt).getTime() : NaN;
    const deadline = Number.isFinite(delivered) ? new Date(delivered + windowDays * 86400000).toISOString() : null;
    let reason = '';
    if (!actor || !sameId(address && address.userId, actor.id)) reason = 'Chỉ người mua được yêu cầu trả hàng.';
    else if (!order || order.statusId !== 'S6') reason = 'Đơn hàng phải được giao thành công trước khi trả hàng.';
    else if (!Number.isFinite(delivered)) reason = 'Đơn hàng chưa có thời gian giao thành công để xác định hạn trả hàng.';
    else if (new Date(now).getTime() < delivered || new Date(now).getTime() > new Date(deadline).getTime()) reason = `Đã quá thời hạn trả hàng ${windowDays} ngày sau khi giao thành công.`;
    else if (request && request.status !== 'REJECTED') reason = request.status === 'REFUNDED' ? 'Đơn hàng đã được hoàn tiền.' : 'Đơn hàng đã có yêu cầu trả hàng đang xử lý.';
    return { windowDays, deadline, canRequest: !reason, reason, scope: 'WHOLE_ORDER' };
}

function createAfterSalesService(db, dependencies = {}) {
    const transaction = work => db.sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, work);
    const locked = tx => ({ transaction: tx, lock: tx.LOCK.UPDATE });
    const now = dependencies.now || (() => new Date());
    const event = (order, actor, type, title, message, tx, metadata = {}) => recordOrderEvent(db,
        { order, actor, actorId: actor && actor.id, type, title, message, metadata }, tx);
    const response = (request, message) => ({ errCode: 0, errMessage: message, data: plain(request) });

    async function loadOrder(orderId, tx) {
        if (!validId(orderId)) fail('Mã đơn hàng không hợp lệ.');
        const order = await db.OrderProduct.findOne({ where: { id: Number(orderId) }, ...locked(tx), raw: false });
        if (!order) fail('Không tìm thấy đơn hàng.', 2);
        return order;
    }
    const loadRequest = (orderId, tx) => db.ReturnRequest.findOne({ where: { orderId: Number(orderId) }, ...locked(tx), raw: false, order: [['id', 'DESC']] });
    async function owner(order, actor, tx) {
        const address = await db.AddressUser.findOne({ where: { id: order.addressUserId }, transaction: tx, raw: true });
        if (!sameId(address && address.userId, actor && actor.id)) fail('Bạn không có quyền xử lý trả hàng cho đơn này.', 403);
        return address;
    }
    const requireAdmin = actor => { if (!isAdmin(actor)) fail('Chỉ quản trị viên hoặc nhân viên được xử lý yêu cầu này.', 403); };
    const requireRequest = request => { if (!request) fail('Không tìm thấy yêu cầu trả hàng.', 2); };
    const requireSelectedRequest = (request, requestId) => {
        requireRequest(request);
        if (requestId !== undefined && (!validId(requestId) || !sameId(request.id, requestId))) {
            fail('Yêu cầu trả hàng đã thay đổi. Vui lòng tải lại đơn hàng trước khi hoàn tiền.', 2);
        }
    };
    function amountFor(order) {
        if (order.totalPrice === null || order.totalPrice === undefined) fail('Đơn hàng cũ chưa có số tiền đối soát. Vui lòng liên hệ cửa hàng trước khi trả hàng.', 2);
        return money(order.totalPrice);
    }

    // The same variant locks are used by checkout. A unique ledger key also
    // protects against replay after a process restart or repeated receipt.
    async function restockReceivedItems(order, request, tx, reason) {
        const details = await db.OrderDetail.findAll({ where: { orderId: order.id }, transaction: tx, raw: true });
        const quantities = new Map();
        for (const line of details) {
            if (!validId(line.productId) || !validId(line.quantity)) fail('Chi tiết đơn hàng không hợp lệ, chưa thể nhập lại kho.', 2);
            quantities.set(Number(line.productId), (quantities.get(Number(line.productId)) || 0) + Number(line.quantity));
        }
        if (!quantities.size) fail('Đơn hàng không có sản phẩm để nhập lại kho.', 2);
        for (const [productDetailSizeId, quantity] of [...quantities].sort(([left], [right]) => left - right)) {
            const variant = await db.ProductDetailSize.findOne({ where: { id: productDetailSizeId }, ...locked(tx), raw: false });
            if (!variant) fail('Sản phẩm đã bị xóa khỏi kho. Vui lòng khôi phục sản phẩm để nhận hàng hoàn.', 2);
            const idempotencyKey = request ? `return:${request.id}:variant:${productDetailSizeId}` : `undelivered:${order.id}:variant:${productDetailSizeId}`;
            const existing = await db.InventoryAdjustment.findOne({ where: { idempotencyKey }, transaction: tx, raw: true });
            if (!existing) await db.InventoryAdjustment.create({ productDetailSizeId, orderId: order.id,
                returnRequestId: request ? request.id : null, quantity, idempotencyKey, reason }, { transaction: tx });
        }
    }

    const createReturnRequest = (data, actor) => resultOf(async () => {
        if (!actor || !validId(actor.id)) fail('Vui lòng đăng nhập.', 403);
        const reason = text(data.reason, 'Lý do trả hàng');
        const evidence = validateEvidence(data.evidence);
        return transaction(async tx => {
            const order = await loadOrder(data.orderId, tx);
            const address = await owner(order, actor, tx);
            const existing = await loadRequest(order.id, tx);
            const eligibility = evaluateReturnEligibility(order, actor, existing, address, now());
            if (!eligibility.canRequest) fail(eligibility.reason, 2);
            const request = await db.ReturnRequest.create({ orderId: order.id, activeOrderId: order.id,
                userId: Number(actor.id), kind: 'CUSTOMER_RETURN', status: 'REQUESTED', reason, evidence,
                amount: amountFor(order), requestedAt: now() }, { transaction: tx });
            await event(order, actor, 'RETURN_REQUESTED', 'Yêu cầu trả hàng', reason, tx, { returnRequestId: request.id, amount: Number(request.amount), scope: 'WHOLE_ORDER' });
            return response(request, 'Đã gửi yêu cầu trả toàn bộ đơn hàng. Cửa hàng sẽ xem xét trước khi bạn gửi hàng về.');
        });
    });

    const reviewReturnRequest = (data, actor) => resultOf(async () => {
        requireAdmin(actor);
        if (!['APPROVE', 'REJECT'].includes(data.decision)) fail('Quyết định xử lý trả hàng không hợp lệ.');
        const note = text(data.note, data.decision === 'REJECT' ? 'Lý do từ chối' : 'Ghi chú duyệt', 1000, data.decision === 'REJECT');
        return transaction(async tx => {
            const order = await loadOrder(data.orderId, tx);
            const request = await loadRequest(order.id, tx); requireRequest(request);
            const nextStatus = data.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
            if (request.status === nextStatus) return response(request, 'Yêu cầu đã được xử lý.');
            if (request.status !== 'REQUESTED') fail('Chỉ có thể duyệt hoặc từ chối yêu cầu đang chờ.', 2);
            request.status = nextStatus; request.reviewNote = note; request.reviewedById = actor.id;
            if (nextStatus === 'APPROVED') request.approvedAt = now();
            else { request.rejectedAt = now(); request.activeOrderId = null; }
            await request.save({ transaction: tx });
            await event(order, actor, `RETURN_${nextStatus}`, nextStatus === 'APPROVED' ? 'Đã duyệt trả hàng' : 'Đã từ chối trả hàng',
                note || 'Vui lòng gửi toàn bộ sản phẩm về cửa hàng và cập nhật mã vận đơn.', tx, { returnRequestId: request.id });
            return response(request, nextStatus === 'APPROVED' ? 'Đã duyệt yêu cầu. Chờ người mua gửi hàng về.' : 'Đã từ chối yêu cầu trả hàng.');
        });
    });

    const markReturnShipped = (data, actor) => resultOf(async () => {
        const carrier = text(data.carrier, 'Đơn vị vận chuyển', 100);
        const trackingNumber = text(data.trackingNumber, 'Mã vận đơn', 100);
        return transaction(async tx => {
            const order = await loadOrder(data.orderId, tx); await owner(order, actor, tx);
            const request = await loadRequest(order.id, tx); requireRequest(request);
            if (request.status === 'SHIPPED' && request.carrier === carrier && request.trackingNumber === trackingNumber) return response(request, 'Đã lưu vận đơn trả hàng.');
            if (request.status !== 'APPROVED') fail('Yêu cầu chưa được duyệt hoặc đã gửi hàng.', 2);
            request.status = 'SHIPPED'; request.carrier = carrier; request.trackingNumber = trackingNumber; request.shippedAt = now();
            await request.save({ transaction: tx });
            await event(order, actor, 'RETURN_SHIPPED', 'Đã gửi hàng trả', `${carrier}: ${trackingNumber}`, tx, { returnRequestId: request.id });
            return response(request, 'Đã ghi nhận vận đơn. Cửa hàng sẽ xác nhận khi thực nhận và kiểm tra hàng.');
        });
    });

    const receiveReturn = (data, actor) => resultOf(async () => {
        requireAdmin(actor);
        if (typeof data.resellable !== 'boolean') fail('Vui lòng xác nhận hàng hoàn có thể bán lại hay không.');
        const inspectionNote = text(data.inspectionNote, 'Kết quả kiểm tra hàng hoàn');
        return transaction(async tx => {
            const order = await loadOrder(data.orderId, tx);
            const request = await loadRequest(order.id, tx); requireRequest(request);
            if (request.receivedAt && ['REFUND_PENDING', 'REFUNDED'].includes(request.status)) return response(request, 'Hàng trả đã được nhận trước đó.');
            if (request.status !== 'SHIPPED') fail('Chỉ xác nhận thực nhận hàng sau khi người mua cập nhật vận đơn trả hàng.', 2);
            if (data.resellable) await restockReceivedItems(order, request, tx, 'CUSTOMER_RETURN');
            request.status = 'REFUND_PENDING'; request.receivedAt = now(); request.receivedById = actor.id;
            request.resellable = data.resellable; request.inspectionNote = inspectionNote;
            await request.save({ transaction: tx });
            await event(order, actor, 'RETURN_RECEIVED', 'Đã nhận hàng trả, chờ hoàn tiền', inspectionNote, tx,
                { returnRequestId: request.id, resellable: data.resellable, amount: Number(request.amount) });
            return response(request, 'Đã xác nhận hàng thực về kho. Kho đã cập nhật theo kết quả kiểm tra; tiền hoàn vẫn đang chờ xử lý.');
        });
    });

    const confirmManualRefund = (data, actor) => resultOf(async () => {
        requireAdmin(actor);
        const paymentReference = text(data.paymentReference, 'Mã chuyển tiền', 150);
        const paymentProof = validateEvidence(data.paymentProof, true);
        return transaction(async tx => {
            const order = await loadOrder(data.orderId, tx);
            if (Number(order.isPaymentOnlien) === 1) fail('Đơn thanh toán trực tuyến phải hoàn tiền qua cổng thanh toán gốc.', 2);
            const request = await loadRequest(order.id, tx); requireRequest(request);
            if (request.status === 'REFUNDED') return response(request, 'Đã ghi nhận xác nhận chuyển tiền trước đó.');
            if (request.status !== 'REFUND_PENDING' || !request.receivedAt) fail('Chưa đủ điều kiện hoàn tiền: cửa hàng phải thực nhận hàng trả trước.', 2);
            request.status = 'REFUNDED'; request.refundMethod = 'manual'; request.refundReference = paymentReference;
            request.refundProof = paymentProof; request.refundedAt = now(); request.refundedById = actor.id;
            await request.save({ transaction: tx });
            await event(order, actor, 'REFUND_MANUALLY_CONFIRMED', 'Cửa hàng xác nhận đã chuyển tiền hoàn',
                `Cửa hàng ghi nhận chuyển ${Number(request.amount).toLocaleString('vi-VN')}đ. Mã tham chiếu: ${paymentReference}.`, tx,
                { returnRequestId: request.id, amount: Number(request.amount), method: 'manual' });
            return response(request, 'Đã lưu xác nhận chuyển tiền thủ công và minh chứng của cửa hàng.');
        });
    });

    const refundOnlineReturn = (data, actor) => resultOf(async () => {
        requireAdmin(actor);
        const selected = await transaction(async tx => {
            const order = await loadOrder(data.orderId, tx);
            if (Number(order.isPaymentOnlien) !== 1) fail('Đơn COD sử dụng xác nhận hoàn tiền thủ công.', 2);
            const request = await loadRequest(order.id, tx); requireSelectedRequest(request, data.returnRequestId);
            if (request.status === 'REFUNDED') return { completed: plain(request) };
            if (request.status !== 'REFUND_PENDING' || !request.receivedAt) fail('Phải xác nhận thực nhận hàng trả trước khi hoàn tiền.', 2);
            return { orderId: order.id, request: plain(request) };
        });
        if (selected.completed) return response(selected.completed, 'Đơn hàng đã được hoàn tiền.');
        const gateway = dependencies.paymentGateway || require('./paymentGatewayService').createPaymentGatewayService(db);
        // Never hold inventory/order locks during the remote financial operation.
        const result = await gateway.requestRefund({ orderId: selected.orderId, refundKey: `return-request:${selected.request.id}`,
            amountVnd: Number(selected.request.amount), actorId: actor.id, reason: selected.request.reason });
        return transaction(async tx => {
            const order = await loadOrder(selected.orderId, tx);
            const request = await loadRequest(order.id, tx); requireRequest(request);
            if (request.id !== selected.request.id) fail('Yêu cầu trả hàng đã thay đổi, cần đối soát kết quả hoàn tiền.', 2);
            if (request.status === 'REFUNDED') return response(request, 'Đơn hàng đã được hoàn tiền.');
            const previousProviderStatus = request.refundProviderStatus;
            request.refundMethod = 'provider';
            request.refundProviderStatus = result.status === 'COMPLETED' && result.errCode !== 0 ? 'REVIEW_REQUIRED' : (result.status || 'REVIEW_REQUIRED');
            if (result.providerRefundId || result.refundId) request.refundReference = String(result.providerRefundId || result.refundId);
            if (result.status === 'COMPLETED' && result.errCode === 0) {
                request.status = 'REFUNDED'; request.refundedAt = now(); request.refundedById = actor.id;
            }
            await request.save({ transaction: tx });
            if (previousProviderStatus !== request.refundProviderStatus) await event(order, actor,
                request.status === 'REFUNDED' ? 'REFUND_COMPLETED' : 'REFUND_PROVIDER_PENDING',
                request.status === 'REFUNDED' ? 'Cổng thanh toán xác nhận hoàn tiền' : 'Hoàn tiền qua cổng đang chờ xử lý',
                request.status === 'REFUNDED' ? `Đã xác minh hoàn tiền ${Number(request.amount).toLocaleString('vi-VN')}đ qua cổng thanh toán gốc.` : (result.errMessage || 'Chưa có xác nhận hoàn tiền thành công từ cổng thanh toán.'), tx,
                { returnRequestId: request.id, provider: result.provider, providerRefundId: result.providerRefundId, providerStatus: result.status });
            return { ...response(request, request.status === 'REFUNDED' ? 'Cổng thanh toán đã xác nhận hoàn tiền thành công.' : 'Đã lưu trạng thái đối soát. Tiền hoàn chưa được xác nhận thành công.'),
                refund: result };
        });
    });

    // Used only by an admin physically receiving an unsuccessful delivery.
    // COD was never collected, so it has no artificial refund record.
    async function receiveUndeliveredItems(order, data, actor, tx) {
        let request = null;
        if (Number(order.isPaymentOnlien) === 1) {
            const address = await db.AddressUser.findOne({ where: { id: order.addressUserId }, transaction: tx, raw: true });
            if (!address || !validId(address.userId)) fail('Đơn hàng không còn người mua để đối soát hoàn tiền.', 2);
            request = await loadRequest(order.id, tx);
            if (!request) request = await db.ReturnRequest.create({ orderId: order.id, activeOrderId: order.id, userId: address.userId,
                kind: 'UNDELIVERED', status: 'REFUND_PENDING', reason: order.lastDeliveryFailureReason || data.inspectionNote,
                amount: amountFor(order), requestedAt: now(), approvedAt: now(), receivedAt: now(),
                receivedById: actor.id, resellable: data.resellable, inspectionNote: data.inspectionNote }, { transaction: tx });
        }
        if (data.resellable) await restockReceivedItems(order, request, tx, 'UNDELIVERED');
        return request;
    }

    return { createReturnRequest, reviewReturnRequest, markReturnShipped, receiveReturn, confirmManualRefund, refundOnlineReturn,
        restockReceivedItems, receiveUndeliveredItems, returnEligibility: evaluateReturnEligibility };
}
module.exports = { createAfterSalesService, evaluateReturnEligibility, validateEvidence };
