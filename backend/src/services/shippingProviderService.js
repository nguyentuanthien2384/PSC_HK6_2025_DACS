const crypto = require('crypto');
const { Op, Transaction } = require('sequelize');
const { fail, positiveInteger, resultOf } = require('../utils/commerce');
const { recordOrderEvent } = require('./orderEventService');
const admin = actor => actor && ['R1', 'R4'].includes(actor.roleId);
const text = value => typeof value === 'string' ? value.trim() : '';
const validId = value => ['number', 'string'].includes(typeof value) && positiveInteger(value);
const environments = {
    ghn: { sandbox: 'https://dev-online-gateway.ghn.vn', production: 'https://online-gateway.ghn.vn' },
    ghtk: { sandbox: 'https://services-staging.ghtklab.com', production: 'https://services.giaohangtietkiem.vn' },
};
const safeShipment = row => {
    if (!row) return null;
    const result = row.get ? row.get({ plain: true }) : { ...row };
    delete result.requestData; delete result.leaseUntil;
    return result;
};
function providerConfig(provider, env) {
    if (!environments[provider]) fail('Đơn vị vận chuyển không hợp lệ.');
    const prefix = provider.toUpperCase();
    const environment = env[`${prefix}_MODE`] || 'sandbox';
    if (!environments[provider][environment]) fail('Môi trường vận chuyển không hợp lệ.');
    const token = env[`${prefix}_TOKEN`];
    const shopId = Number(env.GHN_SHOP_ID);
    const pickup = {
        name: text(env.SHIPPING_PICK_NAME), phone: text(env.SHIPPING_PICK_PHONE), address: text(env.SHIPPING_PICK_ADDRESS),
        province: text(env.SHIPPING_PICK_PROVINCE), district: text(env.SHIPPING_PICK_DISTRICT), ward: text(env.SHIPPING_PICK_WARD),
    };
    const configured = !!token && (provider === 'ghn' ? positiveInteger(shopId) : ['name', 'phone', 'address', 'province', 'ward'].every(key => pickup[key]));
    return { provider, environment, token, shopId, pickup, configured, base: environments[provider][environment], partnerCode: env.GHTK_PARTNER_CODE };
}
function parcelData(data) {
    const values = {};
    for (const [key, max] of [['weight', 50000], ['length', 200], ['width', 200], ['height', 200]]) {
        const value = Number(data?.[key]);
        if (!Number.isSafeInteger(value) || value < 1 || value > max) fail(`Thông số kiện hàng ${key} phải là số nguyên từ 1 đến ${max}.`);
        values[key] = value;
    }
    return values;
}
function shippingState(provider, status) {
    if (provider === 'ghn') {
        if (status === 'delivered') return 'S6';
        if (status === 'delivery_fail' || ['lost', 'damage', 'exception', 'scrap'].includes(status)) return 'S8';
        if (['waiting_to_return', 'return', 'return_transporting', 'return_sorting', 'returning', 'return_fail', 'returned'].includes(status)) return 'S9';
        if (['picked', 'storing', 'sorting', 'transporting', 'delivering', 'money_collect_delivering'].includes(status)) return 'S5';
    } else {
        if ([5, 6].includes(Number(status))) return 'S6';
        if (Number(status) === 9) return 'S8';
        if ([11, 20, 21].includes(Number(status))) return 'S9';
        if ([3, 4].includes(Number(status))) return 'S5';
        // Driver advisory 45/49/123/410 is not a confirmed carrier order status.
    }
    return null;
}
function createShippingProviderService(db, { env = process.env, fetchImpl = global.fetch } = {}) {
    const transaction = work => db.sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, work);
    const lock = tx => ({ transaction: tx, lock: tx.LOCK.UPDATE, raw: false });
    const requireAdmin = actor => { if (!admin(actor)) fail('Chỉ nhân viên cửa hàng được quản lý vận đơn.', 403); };
    const configFor = provider => {
        const config = providerConfig(provider, env);
        if (!config.configured) fail(`${provider.toUpperCase()} chưa được cấu hình. Cần token riêng cho môi trường ${config.environment} và thông tin cửa hàng.`, 3);
        return config;
    };
    async function request(config, path, payload, method = 'POST') {
        const headers = { 'Content-Type': 'application/json', Token: config.token };
        if (config.provider === 'ghn') headers.ShopId = String(config.shopId);
        if (config.provider === 'ghtk' && config.partnerCode) headers['X-Client-Source'] = config.partnerCode;
        let response, result;
        try {
            response = await fetchImpl(config.base + path, { method, headers, redirect: 'error', signal: AbortSignal.timeout(15000), ...(method === 'GET' ? {} : { body: JSON.stringify(payload) }) });
            result = await response.json();
        } catch { const error = new Error('Không xác định được kết quả từ hãng vận chuyển. Đã giữ mã đơn để đối soát; thử đồng bộ lại.'); error.uncertain = true; throw error; }
        if (!response.ok || (config.provider === 'ghn' ? result.code !== 200 : result.success !== true)) {
            if (config.provider === 'ghtk' && result.error?.code === 'ORDER_ID_EXIST' && result.error?.ghtk_label) return { label: String(result.error.ghtk_label), status_id: result.error.status, recovered: true };
            const error = new Error('Hãng vận chuyển từ chối yêu cầu. Kiểm tra địa chỉ, kiện hàng và quyền token trong trang quản trị hãng.');
            error.uncertain = response.status >= 500; error.notFound = [400, 404].includes(response.status); throw error;
        }
        return config.provider === 'ghn' ? result.data : result.order;
    }
    async function lookup(config, shipment) {
        const path = config.provider === 'ghn' ? (shipment.trackingCode
            ? `/shiip/public-api/v2/shipping-order/detail?order_code=${encodeURIComponent(shipment.trackingCode)}`
            : `/shiip/public-api/v2/shipping-order/detail-by-client-code?client_order_code=${encodeURIComponent(shipment.clientOrderCode)}`)
            : `/services/shipment/v2/${encodeURIComponent(shipment.trackingCode || shipment.clientOrderCode)}`;
        const snapshot = await request(config, path, undefined, 'GET');
        if (!snapshot || (config.provider === 'ghn'
            ? snapshot.client_order_code !== shipment.clientOrderCode || Number(snapshot.shop_id) !== config.shopId
            : String(snapshot.partner_id) !== shipment.clientOrderCode)) fail('Vận đơn trả về không thuộc đơn/cửa hàng này.', 3);
        return snapshot;
    }
    async function payloadFor(order, data, tx) {
        const address = await db.AddressUser.findOne({ where: { id: order.addressUserId }, transaction: tx, raw: true });
        if (!address) fail('Đơn hàng không có địa chỉ nhận hàng.', 2);
        const parcel = parcelData(data.parcel);
        const destination = { province: text(data.destination?.province), district: text(data.destination?.district), ward: text(data.destination?.ward) };
        if (!destination.province || !destination.ward || Object.values(destination).some(value => value.length > 255)) fail('Vui lòng nhập tên tỉnh/thành phố và phường/xã nhận hàng.');
        const lines = await db.OrderDetail.findAll({ where: { orderId: order.id }, transaction: tx, raw: true });
        if (!lines.length) fail('Đơn hàng không có sản phẩm.', 2);
        const items = [];
        for (const line of lines) {
            const variant = await db.ProductDetailSize.findOne({ where: { id: line.productId }, transaction: tx, raw: true });
            const detail = variant && await db.ProductDetail.findOne({ where: { id: variant.productdetailId }, transaction: tx, raw: true });
            const product = detail && await db.Product.findOne({ where: { id: detail.productId }, transaction: tx, raw: true });
            items.push({ name: [product?.name || `Sản phẩm ${line.productId}`, detail?.nameDetail].filter(Boolean).join(' - ').slice(0, 512), quantity: Number(line.quantity), price: Number(line.realPrice), code: String(line.productId) });
        }
        const cod = Number(order.isPaymentOnlien) === 1 ? 0 : Number(order.totalPrice);
        if (!Number.isSafeInteger(cod) || cod < 0 || cod > 50000000) fail('Số tiền COD không hợp lệ hoặc vượt giới hạn hãng vận chuyển.');
        const value = Math.max(0, Number(order.subtotal || items.reduce((sum, item) => sum + item.quantity * item.price, 0)) - Number(order.discountAmount || 0));
        return { address, parcel, destination, items, cod, value, note: String(data.note || order.note || '').slice(0, 120) };
    }
    function providerPayload(config, shipment, input) {
        const { address, parcel, destination, items, cod, value, note } = input;
        if (config.provider === 'ghn') return {
            client_order_code: shipment.clientOrderCode, to_name: address.shipName, to_phone: address.shipPhonenumber,
            to_address: address.shipAdress, to_province_name: destination.province, to_ward_name: destination.ward,
            ...(destination.district ? { to_district_name: destination.district, is_new_to_address: false } : { is_new_to_address: true }),
            ...parcel, service_type_id: parcel.weight >= 20000 ? 5 : 2,
            payment_type_id: 1, required_note: 'CHOXEMHANGKHONGTHU', cod_amount: cod, insurance_value: Math.min(value, 5000000),
            note, items: items.map(item => ({ ...item, ...parcel, weight: Math.max(1, Math.ceil(parcel.weight / items.reduce((sum, row) => sum + row.quantity, 0))) })),
        };
        const count = items.reduce((sum, item) => sum + item.quantity, 0);
        return { products: items.map(item => ({ name: item.name, price: item.price, quantity: item.quantity, product_code: item.code, weight: parcel.weight / 1000 / count })), order: {
            id: shipment.clientOrderCode, pick_name: config.pickup.name, pick_tel: config.pickup.phone, pick_address: config.pickup.address,
            pick_province: config.pickup.province, pick_district: config.pickup.district, pick_ward: config.pickup.ward,
            name: address.shipName, tel: address.shipPhonenumber, address: address.shipAdress, province: destination.province, district: destination.district,
            ward: destination.ward, hamlet: 'Khác', pick_money: cod, is_freeship: 1, value, note, total_weight: parcel.weight / 1000,
        } };
    }
    const providers = () => resultOf(async () => ({ errCode: 0, data: [
        { id: 'internal', name: 'Shipper cửa hàng', configured: true, environment: 'internal', supportsSandbox: false },
        ...['ghn', 'ghtk'].map(id => { const config = providerConfig(id, env); return { id, name: id === 'ghn' ? 'Giao Hàng Nhanh' : 'Giao Hàng Tiết Kiệm', configured: config.configured, environment: config.environment, supportsSandbox: true, requiredFields: ['parcel.weight', 'parcel.length', 'parcel.width', 'parcel.height', 'destination.province', 'destination.ward'] }; }),
    ] }));
    const book = (data = {}, actor) => resultOf(async () => {
        requireAdmin(actor);
        if (!validId(data.orderId)) fail('Mã đơn hàng không hợp lệ.');
        const config = configFor(data.provider);
        let recovery = false;
        const reserved = await transaction(async tx => {
            const order = await db.OrderProduct.findOne({ where: { id: Number(data.orderId) }, ...lock(tx) });
            if (!order || order.statusId !== 'S4' || positiveInteger(order.shipperId)) fail('Chỉ được tạo vận đơn cho đơn chờ lấy hàng chưa có shipper.', 2);
            let shipment = await db.Shipment.findOne({ where: { orderId: order.id }, ...lock(tx) });
            if (shipment && shipment.provider !== config.provider) fail('Đơn đã đăng ký vận chuyển với hãng khác; đối soát/hủy vận đơn trước.', 2);
            if (shipment?.trackingCode) return { shipment, completed: true };
            if (shipment?.leaseUntil && new Date(shipment.leaseUntil) > new Date()) fail('Đang tạo vận đơn. Vui lòng chờ rồi làm mới.', 2);
            const input = shipment && ['UNCERTAIN', 'CREATING'].includes(shipment.status) ? JSON.parse(shipment.requestData) : await payloadFor(order, data, tx);
            recovery = !!shipment && ['UNCERTAIN', 'CREATING'].includes(shipment.status);
            if (!shipment) shipment = await db.Shipment.create({ orderId: order.id, provider: config.provider, environment: config.environment, clientOrderCode: `DACS-${crypto.randomUUID()}`, status: 'CREATING', requestData: JSON.stringify(input) }, { transaction: tx });
            if (shipment.environment !== config.environment) fail('Không thể đổi môi trường của vận đơn đã đăng ký.', 2);
            shipment.status = 'CREATING'; shipment.requestData = JSON.stringify(input); shipment.leaseUntil = new Date(Date.now() + 60000); shipment.lastError = null;
            order.deliveryProvider = config.provider;
            await shipment.save({ transaction: tx }); await order.save({ transaction: tx });
            return { shipment, input };
        });
        if (reserved.completed) return { errCode: 0, data: safeShipment(reserved.shipment) };
        try {
            let snapshot;
            if (recovery) {
                try { snapshot = await lookup(config, reserved.shipment); }
                catch (error) { if (!error.notFound) throw error; }
            }
            if (!snapshot) snapshot = await request(config, config.provider === 'ghn' ? '/shiip/public-api/v2/shipping-order/create' : '/services/shipment/order/?ver=1.5', providerPayload(config, reserved.shipment, reserved.input));
            const trackingCode = config.provider === 'ghn' ? snapshot?.order_code : snapshot?.label || snapshot?.label_id;
            if (!trackingCode || typeof trackingCode !== 'string' || trackingCode.length > 100) { const error = new Error('Hãng chưa trả mã vận đơn; cần đối soát trước khi gửi lại.'); error.uncertain = true; throw error; }
            return transaction(async tx => {
                const order = await db.OrderProduct.findOne({ where: { id: data.orderId }, ...lock(tx) });
                const shipment = await db.Shipment.findOne({ where: { id: reserved.shipment.id }, ...lock(tx) });
                shipment.trackingCode = trackingCode; shipment.status = String(snapshot.status || snapshot.status_id || 'BOOKED');
                shipment.fee = Number(snapshot.total_fee ?? snapshot.fee ?? 0); shipment.leaseUntil = null; shipment.lastError = null;
                const expected = snapshot.expected_delivery_time || snapshot.leadtime;
                if (expected && Number.isFinite(new Date(expected).getTime())) shipment.expectedDeliveryAt = new Date(expected);
                await shipment.save({ transaction: tx });
                await recordOrderEvent(db, { order, type: 'SHIPMENT_BOOKED', title: 'Đã tạo vận đơn', message: `Đơn #${order.id} được chuyển qua ${config.provider.toUpperCase()}, mã ${trackingCode}${config.environment === 'sandbox' ? ' (sandbox)' : ''}.`, actorId: actor.id, metadata: { provider: config.provider, trackingCode, environment: config.environment } }, tx);
                return { errCode: 0, data: safeShipment(shipment) };
            });
        } catch (error) {
            await transaction(async tx => {
                const order = await db.OrderProduct.findOne({ where: { id: data.orderId }, ...lock(tx) });
                const shipment = await db.Shipment.findOne({ where: { id: reserved.shipment.id }, ...lock(tx) });
                // Keep an ambiguous booking assigned to its carrier until verified reconciliation.
                const uncertain = error.uncertain || recovery;
                shipment.status = uncertain ? 'UNCERTAIN' : 'FAILED'; shipment.lastError = error.message.slice(0, 1000); shipment.leaseUntil = null;
                if (!uncertain) { order.deliveryProvider = 'internal'; await order.save({ transaction: tx }); }
                await shipment.save({ transaction: tx });
            });
            fail(error.message, 3);
        }
    });
    async function syncByShipment(shipment) {
        const config = configFor(shipment.provider);
        if (config.environment !== shipment.environment) fail('Cấu hình môi trường không khớp vận đơn.', 3);
        const snapshot = await lookup(config, shipment);
        return transaction(async tx => {
            const order = await db.OrderProduct.findOne({ where: { id: shipment.orderId }, ...lock(tx) });
            const current = await db.Shipment.findOne({ where: { id: shipment.id }, ...lock(tx) });
            const code = config.provider === 'ghn' ? snapshot.order_code : snapshot.label_id;
            if (!code || (current.trackingCode && current.trackingCode !== code)) fail('Mã vận đơn không khớp.', 3);
            const status = String(snapshot.status);
            const previous = current.status;
            current.trackingCode = code; current.status = status; current.lastError = null; current.lastSyncedAt = new Date(); current.leaseUntil = null;
            let next = shippingState(config.provider, status);
            if ((config.provider === 'ghn' && status === 'cancel') || (config.provider === 'ghtk' && status === '-1')) next = order.statusId === 'S4' && Number(order.isPaymentOnlien) === 0 ? 'S7' : 'S9';
            // Terminal business states never regress from a delayed/duplicate provider message.
            if (next && !['S6', 'S7', 'S10'].includes(order.statusId) && !(order.statusId === 'S9' && next !== 'S9')) {
                order.statusId = next;
                if (next === 'S6') order.deliveredAt = new Date();
                if (next === 'S7') { order.cancelledAt = new Date(); order.cancellationReason = 'Hãng vận chuyển xác nhận hủy trước khi lấy hàng.'; }
                await order.save({ transaction: tx });
            }
            await current.save({ transaction: tx });
            if (status !== previous) await recordOrderEvent(db, { order, type: 'SHIPMENT_STATUS', title: 'Cập nhật vận chuyển', message: `${config.provider.toUpperCase()}: ${snapshot.status_text || status}.`, metadata: { provider: config.provider, status, trackingCode: code, environment: current.environment } }, tx);
            return { errCode: 0, data: safeShipment(current), statusId: order.statusId };
        });
    }
    const sync = (data = {}, actor) => resultOf(async () => {
        requireAdmin(actor);
        if (!validId(data.orderId)) fail('Mã đơn không hợp lệ.');
        const shipment = await db.Shipment.findOne({ where: { orderId: Number(data.orderId) }, raw: true });
        if (!shipment) fail('Đơn chưa có vận đơn hãng.', 2);
        return syncByShipment(shipment);
    });
    const cancel = (data = {}, actor) => resultOf(async () => {
        requireAdmin(actor);
        if (!validId(data.orderId)) fail('Mã đơn hàng không hợp lệ.');
        const order = await db.OrderProduct.findOne({ where: { id: data.orderId }, raw: true });
        if (!order || order.statusId !== 'S4' || Number(order.isPaymentOnlien) === 1) fail('Chỉ hủy vận đơn COD trước khi hãng lấy hàng.', 2);
        const shipment = await db.Shipment.findOne({ where: { orderId: order.id }, raw: true });
        if (!shipment?.trackingCode) fail('Chưa xác định được vận đơn; cần đồng bộ trước.', 2);
        const config = configFor(shipment.provider);
        if (shipment.environment !== config.environment) fail('Môi trường không khớp vận đơn.', 3);
        // Carrier acceptance is only a request; verified status sync decides stock release.
        if (config.provider === 'ghn') {
            const result = await request(config, '/shiip/public-api/v2/switch-status/cancel', { order_codes: [shipment.trackingCode] });
            if (!Array.isArray(result) || !result.some(item => item.order_code === shipment.trackingCode && item.result === true)) fail('Hãng vận chuyển chưa chấp nhận hủy vận đơn này.', 2);
        }
        else await request(config, `/services/shipment/cancel/${encodeURIComponent(shipment.trackingCode)}`, {});
        await db.Shipment.update({ lastError: null }, { where: { id: shipment.id } });
        return syncByShipment(shipment);
    });
    const webhook = (provider, body = {}, secret) => resultOf(async () => {
        const expected = env[`${provider.toUpperCase()}_WEBHOOK_SECRET`];
        if (!expected || expected.length < 24) fail('Webhook vận chuyển chưa được cấu hình.', 503);
        if (typeof secret !== 'string' || Buffer.byteLength(secret) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) fail('Webhook không được xác thực.', 403);
        const code = provider === 'ghn' ? text(body.OrderCode) : text(body.label_id);
        if (!code || code.length > 100) fail('Thiếu mã vận đơn.');
        const shipment = await db.Shipment.findOne({ where: { provider, trackingCode: code }, raw: true });
        if (!shipment) fail('Không tìm thấy vận đơn.', 404);
        // Never accept a claimed delivery/refund status from the callback body itself.
        return syncByShipment(shipment);
    });
    async function runSyncBatch(limit = 20) {
        const shipments = await db.Shipment.findAll({ where: { status: { [Op.notIn]: ['FAILED', 'delivered', 'returned', 'cancel', '5', '6', '21', '-1'] } }, limit, order: [['lastSyncedAt', 'ASC'], ['id', 'ASC']], raw: true });
        for (const shipment of shipments) {
            if (!providerConfig(shipment.provider, env).configured || (shipment.leaseUntil && new Date(shipment.leaseUntil) > new Date())) continue;
            try { await syncByShipment(shipment); }
            catch (error) { await db.Shipment.update({ lastError: 'Chưa đồng bộ được với hãng vận chuyển.', lastSyncedAt: new Date() }, { where: { id: shipment.id } }); }
        }
    }
    return { providers, book, sync, cancel, webhook, runSyncBatch, syncByShipment };
}
module.exports = { createShippingProviderService, providerConfig, parcelData, shippingState, safeShipment };
