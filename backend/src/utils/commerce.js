const crypto = require('crypto');
const qs = require('qs');

class CommerceError extends Error {
    constructor(message, errCode = 1, extra = {}) {
        super(message);
        this.errCode = errCode;
        this.extra = extra;
    }
}

const fail = (message, errCode = 1, extra) => { throw new CommerceError(message, errCode, extra); };
const positiveInteger = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const money = value => {
    if (value === null || value === undefined || value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0) {
        fail('Giá sản phẩm hoặc phí vận chuyển không hợp lệ.');
    }
    return Number(value);
};

function normalizeLines(lines) {
    if (!Array.isArray(lines) || !lines.length || lines.length > 100) fail('Giỏ hàng trống hoặc không hợp lệ.');
    const result = new Map();
    for (const line of lines) {
        if (!line || !positiveInteger(line.productId) || !positiveInteger(line.quantity)) {
            fail('Sản phẩm và số lượng phải là số nguyên dương.');
        }
        const productId = Number(line.productId);
        const quantity = (result.get(productId) || 0) + Number(line.quantity);
        if (!positiveInteger(quantity) || quantity > 10000) fail('Số lượng sản phẩm không hợp lệ.');
        result.set(productId, quantity);
    }
    return [...result].map(([productId, quantity]) => ({ productId, quantity })).sort((a, b) => a.productId - b.productId);
}

function voucherDiscount(type, subtotal) {
    const minValue = money(type.minValue || 0);
    if (subtotal < minValue) fail('Đơn hàng chưa đạt giá trị tối thiểu của voucher.', 2);
    const value = money(type.value || 0);
    const maxValue = money(type.maxValue || 0);
    const discount = type.typeVoucher === 'percent' ? Math.floor(subtotal * Math.min(value, 100) / 100) : (maxValue || value);
    return Math.min(subtotal, maxValue > 0 ? Math.min(discount, maxValue) : discount);
}

function voucherIsActive(voucher, now = Date.now()) {
    const dateValue = value => /^\d+$/.test(String(value)) ? Number(value) : new Date(value).getTime();
    const from = dateValue(voucher.fromDate);
    const to = dateValue(voucher.toDate);
    // Voucher dates in this application's admin screen are local calendar dates.
    const endOfDay = new Date(to);
    endOfDay.setHours(23, 59, 59, 999);
    return Number.isFinite(from) && Number.isFinite(to) && from <= now && now <= endOfDay.getTime();
}

function vnpayParams(data) {
    return Object.fromEntries(Object.entries(data).filter(([key, value]) => key.startsWith('vnp_') && !['vnp_SecureHash', 'vnp_SecureHashType'].includes(key) && typeof value === 'string'));
}

function encodeVnpay(params) {
    const sorted = {};
    Object.keys(params).sort().forEach(key => {
        sorted[encodeURIComponent(key)] = encodeURIComponent(String(params[key])).replace(/%20/g, '+');
    });
    return qs.stringify(sorted, { encode: false });
}

function signVnpay(params, secret) {
    return crypto.createHmac('sha512', secret).update(encodeVnpay(params), 'utf8').digest('hex');
}

function verifyVnpay(data, secret) {
    const supplied = data.vnp_SecureHash;
    if (!secret || typeof supplied !== 'string' || !/^[a-f\d]{128}$/i.test(supplied)) return false;
    return crypto.timingSafeEqual(Buffer.from(signVnpay(vnpayParams(data), secret), 'hex'), Buffer.from(supplied, 'hex'));
}

function canReadOrder(order, address, actor) {
    return !!actor && (['R1', 'R4'].includes(actor.roleId) || String(address && address.userId) === String(actor.id) || (actor.roleId === 'R3' && String(order.shipperId) === String(actor.id)));
}

function canTransitionOrder(order, address, actor, nextStatus) {
    if (!actor) return false;
    const transitions = { S3: ['S4', 'S7'], S4: ['S5', 'S7'], S5: ['S6'], S6: [], S7: [] };
    if (!(transitions[order.statusId] || []).includes(nextStatus)) return false;
    if (['R1', 'R4'].includes(actor.roleId)) return true;
    if (String(address && address.userId) === String(actor.id)) {
        return (nextStatus === 'S7' && Number(order.isPaymentOnlien) === 0) || (order.statusId === 'S5' && nextStatus === 'S6');
    }
    return actor.roleId === 'R3' && String(order.shipperId) === String(actor.id) && order.statusId === 'S5' && nextStatus === 'S6';
}

async function resultOf(work) {
    try { return await work(); } catch (error) {
        if (error instanceof CommerceError) return { errCode: error.errCode, errMessage: error.message, ...error.extra };
        throw error;
    }
}

module.exports = { CommerceError, fail, positiveInteger, money, normalizeLines, voucherDiscount, voucherIsActive, vnpayParams, encodeVnpay, signVnpay, verifyVnpay, canReadOrder, canTransitionOrder, resultOf };
