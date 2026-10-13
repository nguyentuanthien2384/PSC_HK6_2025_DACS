const { Op } = require('sequelize');
const { productImageUrl } = require('../utils/productImage');
const { safeShipment } = require('./shippingProviderService');
const { evaluateReturnEligibility } = require('./afterSalesService');

const safeUser = { exclude: ['password', 'usertoken', 'image'] };
const shipperFields = ['id', 'firstName', 'lastName', 'phonenumber', 'roleId', 'statusId'];
const deliveryCustomerFields = ['id', 'firstName', 'lastName', 'phonenumber'];
const paymentFields = ['id', 'orderId', 'provider', 'status', 'totalPrice', 'currency', 'paidAt', 'reviewReason', 'providerPaymentId'];
const ids = values => [...new Set(values.filter(value => value != null && value !== '' && typeof value !== 'boolean')
    .map(Number).filter(value => Number.isSafeInteger(value) && value > 0))];
const indexBy = (rows, key = 'id') => new Map(rows.map(row => [Number(row[key]), row]));
const groupBy = (rows, key) => {
    const groups = new Map();
    for (const row of rows) {
        const id = Number(row[key]);
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(row);
    }
    return groups;
};
const decodeImage = value => value == null ? '' : Buffer.from(value, 'base64').toString('binary');

// Keep relation reads bounded per response instead of querying every order and
// product line separately. All maps live only for this request, so status and
// stock changes are visible on the next fetch without cache invalidation.
function createOrderReadService(db, delivery) {
    const read = (model, field, values, options = {}) => {
        const keys = ids(values);
        return model && keys.length ? model.findAll({ where: { [field]: { [Op.in]: keys } }, raw: true, ...options }) : Promise.resolve([]);
    };

    async function hydrateOrders(orders, actor, options = {}) {
        if (!orders.length) return orders;
        const orderIds = orders.map(order => order.id);
        const shipperIds = ids(orders.map(order => order.shipperId));
        const [addresses, shippers, ratings, summaries, events, requests, shipments, payments, voucherTypes, lines] = await Promise.all([
            options.addresses !== undefined ? options.addresses.filter(Boolean) : read(db.AddressUser, 'id', orders.map(order => order.addressUserId)),
            read(db.User, 'id', shipperIds, { attributes: shipperFields }),
            read(db.ShipperRating, 'orderId', orderIds),
            delivery.ratingSummaries(shipperIds),
            read(db.OrderEvent, 'orderId', orderIds, { attributes: ['id', 'orderId', 'type', 'title', 'message', 'createdAt'], order: [['id', 'ASC']] }),
            read(db.ReturnRequest, 'orderId', orderIds, { order: [['id', 'DESC']] }),
            read(db.Shipment, 'orderId', orderIds, { attributes: { exclude: ['requestData', 'leaseUntil'] } }),
            read(db.PaymentSession, 'orderId', orderIds, { attributes: paymentFields }),
            read(db.TypeVoucher, 'id', orders.map(order => order.voucherData && order.voucherData.typeVoucherId)),
            read(db.OrderDetail, 'orderId', orderIds)
        ]);
        const [customers, sizes] = await Promise.all([
            read(db.User, 'id', addresses.map(address => address.userId), { attributes: actor && actor.roleId === 'R3' ? deliveryCustomerFields : safeUser }),
            read(db.ProductDetailSize, 'id', lines.map(line => line.productId), { include: [{ model: db.Allcode, as: 'sizeData' }], nest: true })
        ]);
        const detailIds = sizes.map(size => size.productdetailId);
        const [details, images] = await Promise.all([
            read(db.ProductDetail, 'id', detailIds),
            // The same versioned image URLs already used by the catalog keep
            // base64 image blobs out of order JSON and reuse browser caching.
            read(db.ProductImage, 'productdetailId', detailIds, {
                attributes: ['id', 'productdetailId', 'caption', 'imageVersion', 'updatedAt'], order: [['id', 'ASC']]
            })
        ]);
        // Purchase summaries need product metadata, while full article bodies
        // remain available through the dedicated product detail endpoint.
        const products = await read(db.Product, 'id', details.map(detail => detail.productId), {
            attributes: { exclude: ['contentHTML', 'contentMarkdown'] }
        });
        const addressById = indexBy(addresses), customerById = indexBy(customers), shipperById = indexBy(shippers);
        const ratingByOrder = indexBy(ratings, 'orderId'), paymentByOrder = indexBy(payments, 'orderId');
        const shipmentByOrder = indexBy(shipments, 'orderId'), typeById = indexBy(voucherTypes);
        const eventsByOrder = groupBy(events, 'orderId'), requestsByOrder = groupBy(requests, 'orderId');
        const linesByOrder = groupBy(lines, 'orderId'), sizeById = indexBy(sizes), detailById = indexBy(details), productById = indexBy(products);
        const imagesByDetail = groupBy(images.map(row => ({ ...row, image: productImageUrl(row, 'card') })), 'productdetailId');
        for (const order of orders) {
            order.image = decodeImage(order.image);
            order.addressUser = addressById.get(Number(order.addressUserId)) || null;
            order.userData = order.addressUser ? customerById.get(Number(order.addressUser.userId)) || null : null;
            const shipper = shipperById.get(Number(order.shipperId));
            order.shipperData = shipper ? { ...shipper, ...summaries.get(Number(order.shipperId)) } : null;
            order.shipperRating = ratingByOrder.get(Number(order.id)) || null;
            order.canRateShipper = !!actor && order.statusId === 'S6' && Number(order.shipperId) > 0 &&
                String(order.addressUser && order.addressUser.userId) === String(actor.id) &&
                String(order.shipperId) !== String(actor.id) && !order.shipperRating;
            order.events = (eventsByOrder.get(Number(order.id)) || []).map(({ orderId, ...event }) => event);
            order.returnRequest = requestsByOrder.get(Number(order.id))?.[0] || null;
            if (order.returnRequest && actor?.roleId === 'R3') {
                order.returnRequest = { ...order.returnRequest };
                delete order.returnRequest.refundProof; delete order.returnRequest.refundReference;
                delete order.returnRequest.payoutDetails;
            }
            order.returnEligibility = evaluateReturnEligibility(order, actor, order.returnRequest, order.addressUser);
            order.shipment = safeShipment(shipmentByOrder.get(Number(order.id)));
            const payment = paymentByOrder.get(Number(order.id));
            if (payment) {
                const { providerPaymentId, orderId, ...safePayment } = payment;
                order.paymentSession = { ...safePayment, isDemo: /^DEMO-/i.test(providerPaymentId || '') };
            } else order.paymentSession = null;
            order.voucherData = order.voucherData || { id: null };
            order.voucherData.typeVoucherOfVoucherData = typeById.get(Number(order.voucherData.typeVoucherId)) || null;
            order.orderDetail = linesByOrder.get(Number(order.id)) || [];
            for (const line of order.orderDetail) {
                const size = sizeById.get(Number(line.productId));
                const detail = size && detailById.get(Number(size.productdetailId));
                line.productDetailSize = size || { id: line.productId, sizeData: { value: '' } };
                line.productDetail = detail || { nameDetail: 'Sản phẩm không còn trong danh mục', discountPrice: line.realPrice };
                line.product = (detail && productById.get(Number(detail.productId))) || { name: 'Sản phẩm đã mua' };
                line.productImage = (detail && imagesByDetail.get(Number(detail.id))) || [{ image: '' }];
            }
            if (order.totalPrice == null) {
                order.subtotal = order.orderDetail.reduce((sum, line) => sum + Number(line.realPrice) * Number(line.quantity), 0);
                order.shippingFee = Number(order.typeShipData && order.typeShipData.price) || 0;
                const type = order.voucherData.typeVoucherOfVoucherData;
                order.discountAmount = type ? Math.min(order.subtotal, type.typeVoucher === 'percent' ?
                    Math.min(Math.floor(order.subtotal * Number(type.value) / 100), Number(type.maxValue)) : Number(type.maxValue)) : 0;
                order.totalPrice = order.subtotal + order.shippingFee - order.discountAmount;
            }
        }
        return orders;
    }
    return { hydrateOrders };
}

module.exports = { createOrderReadService };
