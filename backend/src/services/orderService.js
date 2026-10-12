import db from '../models/index';
import paypal from 'paypal-rest-sdk';
import moment from 'moment';
import { EXCHANGE_RATES } from '../utils/constants';
const crypto = require('crypto');
const { createCommerceService } = require('./commerceService');
const { createDeliveryService } = require('./deliveryService');
const { fail, positiveInteger, resultOf, canReadOrder, encodeVnpay, signVnpay, verifyVnpay } = require('../utils/commerce');
const commerce = createCommerceService(db);
const delivery = createDeliveryService(db);
const afterSales = require('./afterSalesService').createAfterSalesService(db);
const { safeShipment } = require('./shippingProviderService');
const admin = actor => actor && ['R1', 'R4'].includes(actor.roleId);
const safeUser = { exclude: ['password', 'usertoken', 'image'] };
const shipperFields = ['id', 'firstName', 'lastName', 'phonenumber', 'roleId', 'statusId'];
const deliveryCustomerFields = ['id', 'firstName', 'lastName', 'phonenumber'];
const orderIncludes = () => [
    { model: db.TypeShip, as: 'typeShipData' },
    { model: db.Voucher, as: 'voucherData' },
    { model: db.Allcode, as: 'statusOrderData' }
];
const decodeImage = value => value == null ? '' : Buffer.from(value, 'base64').toString('binary');

const createNewOrder = data => resultOf(async () => {
    if (Number(data.isPaymentOnlien || 0) !== 0) fail('Thanh toán trực tuyến phải được xác nhận bởi cổng thanh toán.');
    return commerce.transaction(async tx => commerce.persistOrder(await commerce.quote(data, tx), tx));
});

async function hydrateOrder(order, actor) {
    order.image = decodeImage(order.image);
    order.addressUser = await db.AddressUser.findOne({ where: { id: order.addressUserId }, raw: true });
    order.userData = order.addressUser ? await db.User.findOne({ where: { id: order.addressUser.userId },
        attributes: actor && actor.roleId === 'R3' ? deliveryCustomerFields : safeUser, raw: true }) : null;
    order.shipperData = order.shipperId ? await db.User.findOne({ where: { id: order.shipperId }, attributes: shipperFields, raw: true }) : null;
    order.shipperRating = await db.ShipperRating.findOne({ where: { orderId: order.id }, raw: true });
    if (order.shipperData) Object.assign(order.shipperData, await delivery.ratingSummary(order.shipperId));
    order.canRateShipper = !!actor && order.statusId === 'S6' && Number(order.shipperId) > 0 &&
        String(order.addressUser && order.addressUser.userId) === String(actor.id) &&
        String(order.shipperId) !== String(actor.id) && !order.shipperRating;
    order.events = db.OrderEvent ? await db.OrderEvent.findAll({ where: { orderId: order.id }, attributes: ['id', 'type', 'title', 'message', 'createdAt'], order: [['id', 'ASC']], raw: true }) : [];
    order.returnRequest = db.ReturnRequest ? await db.ReturnRequest.findOne({ where: { orderId: order.id }, order: [['id', 'DESC']], raw: true }) : null;
    if (order.returnRequest && actor?.roleId === 'R3') {
        delete order.returnRequest.refundProof; delete order.returnRequest.refundReference;
        delete order.returnRequest.payoutDetails;
    }
    order.returnEligibility = afterSales.returnEligibility(order, actor, order.returnRequest, order.addressUser);
    order.shipment = db.Shipment ? safeShipment(await db.Shipment.findOne({ where: { orderId: order.id }, raw: true })) : null;
    const payment = await db.PaymentSession.findOne({ where: { orderId: order.id }, attributes: ['id', 'provider', 'status', 'totalPrice', 'currency', 'paidAt', 'reviewReason', 'gatewayOutcome'], raw: true });
    order.paymentSession = payment ? { ...payment, providerOutcome: payment.gatewayOutcome ? JSON.parse(payment.gatewayOutcome) : null } : null;
    if (order.paymentSession) delete order.paymentSession.gatewayOutcome;
    order.voucherData = order.voucherData || { id: null };
    order.voucherData.typeVoucherOfVoucherData = order.voucherData.typeVoucherId ? await db.TypeVoucher.findOne({ where: { id: order.voucherData.typeVoucherId }, raw: true }) : null;
    const details = await db.OrderDetail.findAll({ where: { orderId: order.id }, raw: true });
    for (const line of details) {
        line.productDetailSize = await db.ProductDetailSize.findOne({ where: { id: line.productId }, include: [{ model: db.Allcode, as: 'sizeData' }], raw: true, nest: true });
        line.productDetail = line.productDetailSize ? await db.ProductDetail.findOne({ where: { id: line.productDetailSize.productdetailId }, raw: true }) : null;
        line.product = line.productDetail ? await db.Product.findOne({ where: { id: line.productDetail.productId }, raw: true }) : null;
        line.productImage = line.productDetail ? await db.ProductImage.findAll({ where: { productdetailId: line.productDetail.id }, raw: true }) : [];
        line.productImage.forEach(image => { image.image = decodeImage(image.image); });
        if (!line.productImage.length) line.productImage.push({ image: '' });
        line.productDetailSize = line.productDetailSize || { id: line.productId, sizeData: { value: '' } };
        line.productDetail = line.productDetail || { nameDetail: 'Sản phẩm không còn trong danh mục', discountPrice: line.realPrice };
        line.product = line.product || { name: 'Sản phẩm đã mua' };
    }
    order.orderDetail = details;
    if (order.totalPrice == null) {
        order.subtotal = details.reduce((sum, line) => sum + Number(line.realPrice) * Number(line.quantity), 0);
        order.shippingFee = Number(order.typeShipData && order.typeShipData.price) || 0;
        const type = order.voucherData.typeVoucherOfVoucherData;
        order.discountAmount = type ? Math.min(order.subtotal, type.typeVoucher === 'percent' ? Math.min(Math.floor(order.subtotal * Number(type.value) / 100), Number(type.maxValue)) : Number(type.maxValue)) : 0;
        order.totalPrice = order.subtotal + order.shippingFee - order.discountAmount;
    }
    return order;
}

const getAllOrders = (data = {}, actor) => resultOf(async () => {
    if (!admin(actor)) fail('Bạn không có quyền xem danh sách đơn hàng.', 403);
    const filter = { include: orderIncludes(), order: [['createdAt', 'DESC']], raw: true, nest: true };
    if (data.limit !== undefined) {
        filter.limit = Math.min(100, Math.max(1, Number(data.limit) || 10));
        filter.offset = Math.max(0, Number(data.offset) || 0);
    }
    if (data.statusId && data.statusId !== 'ALL') filter.where = { statusId: data.statusId };
    const result = await db.OrderProduct.findAndCountAll(filter);
    for (const order of result.rows) await hydrateOrder(order, actor);
    return { errCode: 0, data: result.rows, count: result.count };
});

const getDetailOrderById = (id, actor) => resultOf(async () => {
    if (!positiveInteger(id)) fail('Mã đơn hàng không hợp lệ.');
    const order = await db.OrderProduct.findOne({ where: { id }, include: orderIncludes(), raw: true, nest: true });
    if (!order) fail('Không tìm thấy đơn hàng.', 2);
    const address = await db.AddressUser.findOne({ where: { id: order.addressUserId }, raw: true });
    if (!canReadOrder(order, address, actor)) fail('Bạn không có quyền truy cập đơn hàng này.', 403);
    return { errCode: 0, data: await hydrateOrder(order, actor) };
});

const updateStatusOrder = delivery.updateStatusOrder;

const getAllOrdersByUser = userId => resultOf(async () => {
    if (!positiveInteger(userId)) fail('Tài khoản không hợp lệ.');
    const addresses = await db.AddressUser.findAll({ where: { userId }, raw: true });
    for (const address of addresses) {
        address.order = await db.OrderProduct.findAll({ where: { addressUserId: address.id }, include: orderIncludes(), raw: true, nest: true, order: [['createdAt', 'DESC']] });
        for (const order of address.order) await hydrateOrder(order, { id: userId });
    }
    return { errCode: 0, data: addresses };
});

const getAllOrdersByShipper = (data = {}, actor) => resultOf(async () => {
    if (!actor || (!admin(actor) && actor.roleId !== 'R3')) fail('Bạn không có quyền truy cập.', 403);
    const where = { shipperId: admin(actor) ? data.shipperId || actor.id : actor.id };
    if (!positiveInteger(where.shipperId)) fail('Người giao hàng không hợp lệ.');
    if (data.status === 'working') where.statusId = { [db.Sequelize.Op.in]: ['S5', 'S8', 'S9'] };
    if (data.status === 'done') where.statusId = 'S6';
    const orders = await db.OrderProduct.findAll({ where, include: orderIncludes(), order: [['createdAt', 'DESC']], raw: true, nest: true });
    for (const order of orders) await hydrateOrder(order, actor);
    return { errCode: 0, data: orders, summary: await delivery.shipperSummary(where.shipperId) };
});

const getAvailableOrdersForShipper = (data = {}, actor) => resultOf(async () => {
    if (!actor || (!admin(actor) && actor.roleId !== 'R3')) fail('Bạn không có quyền xem đơn chờ giao.', 403);
    const orders = await db.OrderProduct.findAll({ where: delivery.availableWhere(), include: orderIncludes(), order: [['createdAt', 'ASC']], raw: true, nest: true });
    for (const order of orders) await hydrateOrder(order, actor);
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
    paypal.configure({ mode: process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox', client_id: process.env.PAYPAL_CLIENT_ID, client_secret: process.env.PAYPAL_CLIENT_SECRET, request_timeout: 20000 });
}
const paymentGateway = require('./paymentGatewayService').gateway;
const paypalCall = (method, ...args) => new Promise((resolve, reject) => paypal.payment[method](...args, (error, payment) => error ? reject(error) : resolve(payment)));
const frontendUrl = () => process.env.URL_REACT || 'http://localhost:3000';

async function newSession(data, provider) {
    return commerce.transaction(async tx => {
        const checkout = await commerce.quote(data, tx);
        if (checkout.totalPrice <= 0) fail('Giá trị thanh toán trực tuyến phải lớn hơn 0.');
        const currency = provider === 'paypal' ? 'USD' : 'VND';
        const providerAmount = provider === 'paypal' ? (checkout.totalPrice / (Number(process.env.USD_EXCHANGE_RATE) || EXCHANGE_RATES.USD)).toFixed(2) : String(checkout.totalPrice * 100);
        if (Number(providerAmount) <= 0) fail('Giá trị thanh toán trực tuyến không hợp lệ.');
        return db.PaymentSession.create({ id: crypto.randomUUID(), userId: checkout.userId, provider, status: 'PENDING', totalPrice: checkout.totalPrice, currency, providerAmount, checkoutData: JSON.stringify(checkout), expiresAt: new Date(Date.now() + 30 * 60 * 1000) }, { transaction: tx });
    });
}

const paymentOrder = data => resultOf(async () => {
    configurePaypal();
    const session = await newSession(data, 'paypal');
    try {
        const payment = await paypalCall('create', {
            intent: 'sale', payer: { payment_method: 'paypal' },
            redirect_urls: {
                return_url: `${frontendUrl()}/payment/success?checkoutToken=${session.id}`,
                cancel_url: `${frontendUrl()}/order/${data.userId}?paymentCancelled=1`
            },
            transactions: [{ amount: { currency: 'USD', total: session.providerAmount }, custom: session.id, description: 'Thanh toan don hang' }]
        });
        const approval = payment.links && payment.links.find(link => link.rel === 'approval_url');
        if (!approval || !payment.id) throw new Error('PayPal did not return an approval URL');
        session.providerPaymentId = payment.id;
        await session.save();
        return { errCode: 0, link: approval.href, checkoutToken: session.id, totalPrice: Number(session.totalPrice), currency: 'VND' };
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
