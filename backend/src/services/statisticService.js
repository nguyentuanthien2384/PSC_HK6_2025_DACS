import db from '../models/index';
const { Op } = require('sequelize');
const moment = require('moment');
const { fail, resultOf } = require('../utils/commerce');

// Use the shop's calendar, independent of the server's timezone.
const localDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.test(value)
    ? moment.utc(value, moment.ISO_8601, true).utcOffset(420, true)
    : moment(value).utcOffset(420);
const hasValue = value => value !== undefined && value !== null && value !== '';
function date(value) {
    if (!hasValue(value) || !moment(value, moment.ISO_8601, true).isValid()) fail('Vui lòng chọn ngày hợp lệ.');
    return localDate(value);
}
function yearNumber(value) {
    if (!/^\d{4}$/.test(String(value)) || Number(value) < 1900 || Number(value) > 9998) fail('Năm thống kê không hợp lệ.');
    return Number(value);
}
function period(data = {}) {
    if (!['day', 'month', 'year'].includes(data.type)) fail('Loại thống kê không hợp lệ.');
    const start = date(data.oneDate);
    const end = data.type === 'day' ? date(data.twoDate) : start.clone();
    if (data.type === 'day' && start.clone().startOf('day').isAfter(end.clone().startOf('day'))) fail('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    return { start: start.startOf(data.type), end: end.endOf(data.type) };
}
const rangeWhere = ({ start, end }) => ({ [Op.between]: [start.toDate(), end.toDate()] });
const deliveryDate = order => order.deliveredAt || order.updatedAt;
const within = (value, range) => localDate(value).isBetween(range.start, range.end, undefined, '[]');

async function deliveredOrders(range, withCost = false) {
    const orders = await db.OrderProduct.findAll({
        where: { statusId: 'S6', [Op.or]: [{ deliveredAt: rangeWhere(range) }, { deliveredAt: null, updatedAt: rangeWhere(range) }] },
        include: [{ model: db.TypeShip, as: 'typeShipData' }, { model: db.Voucher, as: 'voucherData' }, { model: db.Allcode, as: 'statusOrderData' }],
        raw: true, nest: true, order: [['id', 'DESC']],
    });
    const rows = orders.filter(order => within(deliveryDate(order), range));
    if (!rows.length) return [];
    const lines = await db.OrderDetail.findAll({ where: { orderId: { [Op.in]: rows.map(order => order.id) } }, raw: true });
    const typeIds = [...new Set(rows.filter(order => order.voucherData?.typeVoucherId).map(order => order.voucherData.typeVoucherId))];
    const types = typeIds.length ? await db.TypeVoucher.findAll({ where: { id: { [Op.in]: typeIds } }, raw: true }) : [];
    const variantIds = [...new Set(lines.map(line => line.productId))];
    const refunds = db.ReturnRequest ? await db.ReturnRequest.findAll({ where: { orderId: { [Op.in]: rows.map(order => order.id) }, status: 'REFUNDED' }, attributes: ['orderId', 'amount', 'resellable'], raw: true }) : [];
    const receipts = withCost && variantIds.length ? await db.ReceiptDetail.findAll({ where: { productDetailSizeId: { [Op.in]: variantIds }, createdAt: { [Op.lte]: range.end.toDate() } }, raw: true }) : [];
    return rows.map(order => {
        const orderDetail = lines.filter(line => Number(line.orderId) === Number(order.id));
        const subtotal = orderDetail.reduce((sum, line) => sum + Number(line.realPrice) * Number(line.quantity), 0);
        const type = types.find(item => Number(item.id) === Number(order.voucherData?.typeVoucherId));
        let discount = 0;
        if (order.voucherId && type) {
            discount = type.typeVoucher === 'percent' ? Math.floor(subtotal * Number(type.value || 0) / 100) : Number(type.maxValue || type.value || 0);
            if (Number(type.maxValue) > 0) discount = Math.min(discount, Number(type.maxValue));
        }
        const totalpriceProduct = Number(order.totalPrice ?? (Math.max(0, subtotal - discount) + Number(order.typeShipData?.price || 0)));
        const refund = refunds.find(item => Number(item.orderId) === Number(order.id));
        const refundAmount = refund ? Number(refund.amount) : 0;
        const netRevenue = Math.max(0, totalpriceProduct - refundAmount);
        const result = { ...order, orderDetail, typeShipData: order.typeShipData || {}, voucherData: order.voucherData || {}, totalpriceProduct, refundAmount, netRevenue, deliveredAt: deliveryDate(order) };
        if (withCost) {
            // Cost is estimated from weighted receipts available when delivery completed.
            const importPrice = orderDetail.reduce((sum, line) => {
                const received = receipts.filter(receipt => Number(receipt.productDetailSizeId) === Number(line.productId) && localDate(receipt.createdAt).isSameOrBefore(localDate(deliveryDate(order))));
                const quantity = received.reduce((total, receipt) => total + Number(receipt.quantity), 0);
                const cost = received.reduce((total, receipt) => total + Number(receipt.quantity) * Number(receipt.price), 0);
                return sum + (quantity ? Math.round(cost / quantity) : 0) * Number(line.quantity);
            }, 0);
            result.importPrice = importPrice;
            result.profitPrice = netRevenue - importPrice + (refund?.resellable ? importPrice : 0);
        }
        return result;
    });
}

const getCountCardStatistic = () => resultOf(async () => {
    const [countUser, countProduct, countReview, countOrder] = await Promise.all([
        db.User.count({ where: { statusId: 'S1' } }), db.Product.count(), db.Comment.count({ where: { star: { [Op.gt]: 0 } } }),
        db.OrderProduct.count({ where: { statusId: { [Op.ne]: 'S7' } } }),
    ]);
    return { errCode: 0, data: { countUser, countProduct, countReview, countOrder } };
});
const getCountStatusOrder = (data = {}) => resultOf(async () => {
    const range = period(data);
    const [statuses, orders] = await Promise.all([
        db.Allcode.findAll({ where: { type: 'STATUS-ORDER' }, order: [['code', 'ASC']], raw: true }),
        db.OrderProduct.findAll({ where: { createdAt: rangeWhere(range) }, attributes: ['statusId', 'createdAt'], raw: true }),
    ]);
    return { errCode: 0, data: { arrayLable: statuses.map(status => status.value), arrayValue: statuses.map(status => orders.filter(order => order.statusId === status.code).length) } };
});
const getStatisticByMonth = (data = {}) => resultOf(async () => {
    const year = yearNumber(data.year);
    const start = moment.utc([year, 0, 1]).utcOffset(420, true);
    const rows = await deliveredOrders({ start, end: start.clone().endOf('year') });
    return { errCode: 0, data: {
        arrayMonthLable: Array.from({ length: 12 }, (_, i) => `Th ${i + 1}`),
        arrayMonthValue: Array.from({ length: 12 }, (_, i) => rows.filter(order => localDate(deliveryDate(order)).month() === i).reduce((sum, order) => sum + order.netRevenue, 0)),
    } };
});
const getStatisticByDay = (data = {}) => resultOf(async () => {
    const year = yearNumber(data.year);
    if (!/^\d{1,2}$/.test(String(data.month)) || Number(data.month) < 1 || Number(data.month) > 12) fail('Tháng thống kê phải từ 1 đến 12.');
    const start = moment.utc([year, Number(data.month) - 1, 1]).utcOffset(420, true);
    const rows = await deliveredOrders({ start, end: start.clone().endOf('month') });
    const today = localDate(new Date());
    return { errCode: 0, data: {
        arrayDayLable: Array.from({ length: start.daysInMonth() }, (_, i) => today.isSame(start, 'month') && today.date() === i + 1 ? 'Hôm nay' : i + 1),
        arrayDayValue: Array.from({ length: start.daysInMonth() }, (_, i) => rows.filter(order => localDate(deliveryDate(order)).date() === i + 1).reduce((sum, order) => sum + order.netRevenue, 0)),
    } };
});
const getStatisticOverturn = (data = {}) => resultOf(async () => ({ errCode: 0, data: await deliveredOrders(period(data)) }));
const getStatisticProfit = (data = {}) => resultOf(async () => ({ errCode: 0, data: await deliveredOrders(period(data), true) }));

const getStatisticStockProduct = (data = {}) => resultOf(async () => {
    const filter = { include: [{ model: db.Allcode, as: 'sizeData', attributes: ['value', 'code'] }], raw: true, nest: true, order: [['id', 'ASC']] };
    if (hasValue(data.limit)) {
        if (!Number.isSafeInteger(Number(data.limit)) || Number(data.limit) < 1 || Number(data.limit) > 100 || !Number.isSafeInteger(Number(data.offset || 0)) || Number(data.offset || 0) < 0) fail('Phân trang không hợp lệ.');
        filter.limit = Number(data.limit); filter.offset = Number(data.offset || 0);
    }
    const { rows, count } = await db.ProductDetailSize.findAndCountAll(filter);
    if (!rows.length) return { errCode: 0, data: [], count };
    const ids = rows.map(row => row.id);
    const [receipts, lines, sessions, details, adjustments] = await Promise.all([
        db.ReceiptDetail.findAll({ where: { productDetailSizeId: { [Op.in]: ids } }, raw: true }),
        db.OrderDetail.findAll({ where: { productId: { [Op.in]: ids } }, raw: true }),
        db.PaymentSession.findAll({ where: { status: 'PENDING', expiresAt: { [Op.gt]: new Date() } }, raw: true }),
        db.ProductDetail.findAll({ where: { id: { [Op.in]: [...new Set(rows.map(row => row.productdetailId))] } }, raw: true }),
        db.InventoryAdjustment ? db.InventoryAdjustment.findAll({ where: { productDetailSizeId: { [Op.in]: ids } }, raw: true }) : [],
    ]);
    const orderIds = [...new Set(lines.map(line => line.orderId))];
    const [orders, products] = await Promise.all([
        orderIds.length ? db.OrderProduct.findAll({ where: { id: { [Op.in]: orderIds }, statusId: { [Op.ne]: 'S7' } }, attributes: ['id'], raw: true }) : [],
        db.Product.findAll({ where: { id: { [Op.in]: [...new Set(details.map(detail => detail.productId))] } }, include: [
            { model: db.Allcode, as: 'brandData', attributes: ['value', 'code'] }, { model: db.Allcode, as: 'categoryData', attributes: ['value', 'code'] }, { model: db.Allcode, as: 'statusData', attributes: ['value', 'code'] },
        ], raw: true, nest: true }),
    ]);
    const active = new Set(orders.map(order => Number(order.id)));
    const reservedLines = sessions.flatMap(session => JSON.parse(session.checkoutData).lines || []);
    const result = rows.map(row => {
        const received = receipts.filter(item => Number(item.productDetailSizeId) === Number(row.id)).reduce((sum, item) => sum + Number(item.quantity), 0);
        const sold = lines.filter(item => Number(item.productId) === Number(row.id) && active.has(Number(item.orderId))).reduce((sum, item) => sum + Number(item.quantity), 0);
        const reserved = reservedLines.filter(item => Number(item.productId) === Number(row.id)).reduce((sum, item) => sum + Number(item.quantity), 0);
        const returned = adjustments.filter(item => Number(item.productDetailSizeId) === Number(row.id)).reduce((sum, item) => sum + Number(item.quantity), 0);
        const detail = details.find(item => Number(item.id) === Number(row.productdetailId)) || {};
        return { ...row, productDetaildData: detail, productdData: products.find(item => Number(item.id) === Number(detail.productId)) || {}, returned, onHand: Math.max(0, received + returned - sold), reserved, stock: Math.max(0, received + returned - sold - reserved) };
    });
    return { errCode: 0, data: result, count };
});

module.exports = { getCountCardStatistic, getCountStatusOrder, getStatisticByMonth, getStatisticByDay, getStatisticOverturn, getStatisticProfit, getStatisticStockProduct };
