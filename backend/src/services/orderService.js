import db from '../models/index';
import moment from 'moment';
import { EXCHANGE_RATES } from '../utils/constants';
const crypto = require('crypto');
const { Op } = require('sequelize');
const { createCommerceService } = require('./commerceService');
const { createDeliveryService } = require('./deliveryService');
const { fail, positiveInteger, resultOf, canReadOrder, encodeVnpay, signVnpay, verifyVnpay } = require('../utils/commerce');
const commerce = createCommerceService(db);
const delivery = createDeliveryService(db);
const { hydrateOrders } = require('./orderReadService').createOrderReadService(db, delivery);
const admin = actor => actor && ['R1', 'R4'].includes(actor.roleId);
const orderIncludes = () => [
    { model: db.TypeShip, as: 'typeShipData' },
    { model: db.Voucher, as: 'voucherData' },
    { model: db.Allcode, as: 'statusOrderData' }
];

const createNewOrder = data => resultOf(async () => {
    if (Number(data.isPaymentOnlien || 0) !== 0) fail('Thanh toán trực tuyến phải được xác nhận bởi cổng thanh toán.');
    return commerce.transaction(async tx => commerce.persistOrder(await commerce.quote(data, tx), tx));
});

const getAllOrders = (data = {}, actor) => resultOf(async () => {
    if (!admin(actor)) fail('Bạn không có quyền xem danh sách đơn hàng.', 403);
    const filter = { include: orderIncludes(), order: [['createdAt', 'DESC']], raw: true, nest: true };
    if (data.limit !== undefined) {
        filter.limit = Math.min(100, Math.max(1, Number(data.limit) || 10));
        filter.offset = Math.max(0, Number(data.offset) || 0);
    }
    if (data.statusId && data.statusId !== 'ALL') filter.where = { statusId: data.statusId };
    const result = await db.OrderProduct.findAndCountAll(filter);
    await hydrateOrders(result.rows, actor);
    return { errCode: 0, data: result.rows, count: result.count };
});

const getDetailOrderById = (id, actor) => resultOf(async () => {
    if (!positiveInteger(id)) fail('Mã đơn hàng không hợp lệ.');
    const order = await db.OrderProduct.findOne({ where: { id }, include: orderIncludes(), raw: true, nest: true });
    if (!order) fail('Không tìm thấy đơn hàng.', 2);
    const address = await db.AddressUser.findOne({ where: { id: order.addressUserId }, raw: true });
    if (!canReadOrder(order, address, actor)) fail('Bạn không có quyền truy cập đơn hàng này.', 403);
    await hydrateOrders([order], actor, { addresses: [address] });
    return { errCode: 0, data: order };
});

const updateStatusOrder = delivery.updateStatusOrder;

const getAllOrdersByUser = userId => resultOf(async () => {
    if (!positiveInteger(userId)) fail('Tài khoản không hợp lệ.');
    const addresses = await db.AddressUser.findAll({ where: { userId }, raw: true });
    const orders = addresses.length ? await db.OrderProduct.findAll({ where: { addressUserId: { [Op.in]: addresses.map(address => address.id) } },
        include: orderIncludes(), raw: true, nest: true, order: [['createdAt', 'DESC']] }) : [];
    // Do not attach nested orders to the address objects used in hydration;
    // otherwise order.addressUser would form a circular response structure.
    await hydrateOrders(orders, { id: userId }, { addresses: addresses.map(address => ({ ...address })) });
    const ordersByAddress = new Map();
    for (const order of orders) {
        const id = Number(order.addressUserId);
        if (!ordersByAddress.has(id)) ordersByAddress.set(id, []);
        ordersByAddress.get(id).push(order);
    }
    for (const address of addresses) {
        address.order = ordersByAddress.get(Number(address.id)) || [];
    }
    return { errCode: 0, data: addresses };
});

const getAllOrdersByShipper = (data = {}, actor) => resultOf(async () => {
    if (!actor || (!admin(actor) && actor.roleId !== 'R3')) fail('Bạn không có quyền truy cập.', 403);
    const where = { shipperId: admin(actor) ? data.shipperId || actor.id : actor.id };
    if (!positiveInteger(where.shipperId)) fail('Người giao hàng không hợp lệ.');
    if (data.status === 'working') where.statusId = { [Op.in]: ['S5', 'S8', 'S9'] };
    if (data.status === 'done') where.statusId = 'S6';
    const orders = await db.OrderProduct.findAll({ where, include: orderIncludes(), order: [['createdAt', 'DESC']], raw: true, nest: true });
    const [, summary] = await Promise.all([hydrateOrders(orders, actor), delivery.shipperSummary(where.shipperId)]);
    return { errCode: 0, data: orders, summary };
});

const getAvailableOrdersForShipper = (data = {}, actor) => resultOf(async () => {
    if (!actor || (!admin(actor) && actor.roleId !== 'R3')) fail('Bạn không có quyền xem đơn chờ giao.', 403);
    const orders = await db.OrderProduct.findAll({ where: delivery.availableWhere(), include: orderIncludes(), order: [['createdAt', 'ASC']], raw: true, nest: true });
    await hydrateOrders(orders, actor);
    return { errCode: 0, data: orders, count: orders.length };
});

const confirmOrder = delivery.confirmOrder;
const updateImageOrder = delivery.updateImageOrder;
const rateShipper = delivery.rateShipper;
const getActiveShippers = delivery.getActiveShippers;
const reportDeliveryFailure = delivery.reportDeliveryFailure;
const retryDelivery = delivery.retryDelivery;
const startReturnToWarehouse = delivery.startReturnToWarehouse;
const receiveUndeliveredReturn = delivery.receiveUndeliveredReturn;

function configurePaypal() {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) fail('Cổng PayPal chưa được cấu hình. Vui lòng chọn thanh toán khi nhận hàng.', 3);
}
const paymentGateway = require('./paymentGatewayService').gateway;
const frontendUrl = () => process.env.URL_REACT || 'http://localhost:3000';

async function newSession(data, provider) {
    return commerce.transaction(async tx => {
        const checkout = await commerce.quote(data, tx);
        if (checkout.totalPrice <= 0) fail('Giá trị thanh toán trực tuyến phải lớn hơn 0.');
        const currency = provider === 'paypal' ? 'USD' : 'VND';
        const exchangeRate = Number(process.env.USD_EXCHANGE_RATE || EXCHANGE_RATES.USD);
        if (provider === 'paypal' && (!Number.isFinite(exchangeRate) || exchangeRate <= 0)) fail('Tỷ giá thanh toán PayPal chưa hợp lệ.', 3);
        if (provider === 'vnpay' && checkout.totalPrice > 9999999999) fail('Giá trị thanh toán vượt giới hạn của VNPay.', 3);
        const providerAmount = provider === 'paypal' ? (checkout.totalPrice / exchangeRate).toFixed(2) : (BigInt(checkout.totalPrice) * 100n).toString();
        if (Number(providerAmount) <= 0) fail('Giá trị thanh toán trực tuyến không hợp lệ.');
        return db.PaymentSession.create({ id: crypto.randomUUID(), userId: checkout.userId, provider, gatewayApiVersion: provider === 'paypal' ? 'v2' : 'v1', status: 'PENDING', totalPrice: checkout.totalPrice, currency, providerAmount, checkoutData: JSON.stringify(checkout), expiresAt: new Date(Date.now() + 30 * 60 * 1000) }, { transaction: tx });
    });
}

const paymentOrder = data => resultOf(async () => {
    configurePaypal();
    const session = await newSession(data, 'paypal');
    try {
        const payment = await paymentGateway().createPaypalPayment(session,
            `${frontendUrl()}/payment/success?checkoutToken=${session.id}`, `${frontendUrl()}/order/${data.userId}?paymentCancelled=1`);
        session.providerPaymentId = payment.id;
        await session.save();
        return { errCode: 0, link: payment.approvalUrl, checkoutToken: session.id, totalPrice: Number(session.totalPrice), currency: 'VND', providerAmount: session.providerAmount, providerCurrency: session.currency };
    } catch (error) {
        session.status = 'FAILED';
        await session.save();
        fail('Không thể khởi tạo thanh toán PayPal. Vui lòng thử lại hoặc chọn thanh toán khi nhận hàng.', 3);
    }
});

const paymentOrderSuccess = data => paymentGateway().completePaypal(data);

function configureVnpay() {
    if (!process.env.VNP_TMNCODE || !process.env.VNP_HASHSECRET || process.env.VNP_HASHSECRET === 'SECRETKEY') fail('Cổng VNPay chưa được cấu hình. Vui lòng chọn thanh toán khi nhận hàng.', 3);
}

const paymentOrderVnpay = req => resultOf(async () => {
    configureVnpay();
    const session = await newSession(req.body, 'vnpay');
    const returnUrl = new URL(process.env.VNP_RETURNURL || `${frontendUrl()}/payment/vnpay_return`);
    returnUrl.searchParams.set('checkoutToken', session.id);
    const formatDate = date => moment(date).utcOffset(7).format('YYYYMMDDHHmmss');
    session.gatewayTransactionDate = formatDate(session.createdAt || new Date());
    await session.save();
    const params = {
        vnp_Version: '2.1.0', vnp_Command: 'pay', vnp_TmnCode: process.env.VNP_TMNCODE,
        vnp_Locale: req.body.language === 'en' ? 'en' : 'vn', vnp_CurrCode: 'VND', vnp_TxnRef: session.id,
        vnp_OrderInfo: `Thanh toan don hang ${session.id}`, vnp_OrderType: 'other', vnp_Amount: session.providerAmount,
        vnp_ReturnUrl: returnUrl.toString(), vnp_IpAddr: req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1',
        vnp_CreateDate: session.gatewayTransactionDate, vnp_ExpireDate: formatDate(session.expiresAt)
    };
    if (req.body.bankCode && /^[a-z\d]{2,30}$/i.test(req.body.bankCode)) params.vnp_BankCode = req.body.bankCode;
    params.vnp_SecureHash = signVnpay(params, process.env.VNP_HASHSECRET);
    const url = process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    return { errCode: 0, link: `${url}?${encodeVnpay(params)}`, checkoutToken: session.id, totalPrice: Number(session.totalPrice), currency: 'VND' };
});

function validateVnpay(data) {
    paymentGateway().validateVnpayNotice(data);
    if (data.vnp_ResponseCode !== '00' || data.vnp_TransactionStatus !== '00') fail('Giao dịch VNPay bị hủy hoặc chưa thanh toán thành công.', 2);
}

const paymentOrderVnpaySuccess = data => paymentGateway().completeVnpay(data);

// Compatibility endpoint verifies the gateway response; order creation is only
// performed by paymentOrderVnpaySuccess with the persisted checkout session.
const confirmOrderVnpay = data => resultOf(async () => {
    validateVnpay(data);
    return { errCode: 0, errMessage: 'Chữ ký giao dịch hợp lệ.' };
});

module.exports = { createNewOrder, getAllOrders, getDetailOrderById, updateStatusOrder, getAllOrdersByUser, getAllOrdersByShipper, getAvailableOrdersForShipper, getActiveShippers, rateShipper, confirmOrder, updateImageOrder, reportDeliveryFailure, retryDelivery, startReturnToWarehouse, receiveUndeliveredReturn, paymentOrder, paymentOrderSuccess, paymentOrderVnpay, paymentOrderVnpaySuccess, confirmOrderVnpay };
