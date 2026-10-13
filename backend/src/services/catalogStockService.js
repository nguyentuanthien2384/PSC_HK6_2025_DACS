const { Op, fn, col } = require('sequelize');

// Read-only storefront snapshot. Checkout still locks variants and rechecks stock transactionally.
async function catalogStocks(db, variantIds) {
    const ids = [...new Set(variantIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
    if (!ids.length) return new Map();
    const received = await db.ReceiptDetail.findAll({
        where: { productDetailSizeId: { [Op.in]: ids } },
        attributes: ['productDetailSizeId', [fn('SUM', col('quantity')), 'quantity']],
        group: ['productDetailSizeId'], raw: true,
    });
    const soldLines = await db.OrderDetail.findAll({
        where: { productId: { [Op.in]: ids } },
        attributes: ['productId', 'orderId', [fn('SUM', col('quantity')), 'quantity']],
        group: ['productId', 'orderId'], raw: true,
    });
    const orderIds = [...new Set(soldLines.map(line => Number(line.orderId)))];
    const orders = orderIds.length ? await db.OrderProduct.findAll({
        where: { id: { [Op.in]: orderIds }, statusId: { [Op.ne]: 'S7' } }, attributes: ['id'], raw: true,
    }) : [];
    const adjustments = db.InventoryAdjustment ? await db.InventoryAdjustment.findAll({
        where: { productDetailSizeId: { [Op.in]: ids } },
        attributes: ['productDetailSizeId', [fn('SUM', col('quantity')), 'quantity']],
        group: ['productDetailSizeId'], raw: true,
    }) : [];
    const movements = db.StockMovement ? await db.StockMovement.findAll({
        where: { productDetailSizeId: { [Op.in]: ids } },
        attributes: ['productDetailSizeId', [fn('SUM', col('quantity')), 'quantity']],
        group: ['productDetailSizeId'], raw: true,
    }) : [];
    const sessions = await db.PaymentSession.findAll({
        where: { status: 'PENDING', expiresAt: { [Op.gt]: new Date() } }, attributes: ['checkoutData'], raw: true,
    });
    const stock = new Map(ids.map(id => [id, 0]));
    const add = (id, quantity) => { if (stock.has(Number(id))) stock.set(Number(id), stock.get(Number(id)) + Number(quantity)); };
    for (const row of received) add(row.productDetailSizeId, row.quantity);
    for (const row of adjustments) add(row.productDetailSizeId, row.quantity);
    for (const row of movements) add(row.productDetailSizeId, row.quantity);
    const activeOrders = new Set(orders.map(order => Number(order.id)));
    for (const row of soldLines) if (activeOrders.has(Number(row.orderId))) add(row.productId, -Number(row.quantity));
    for (const session of sessions) {
        const checkout = JSON.parse(session.checkoutData);
        for (const line of checkout.lines || []) add(line.productId, -Number(line.quantity));
    }
    return new Map([...stock].map(([id, quantity]) => [id, Math.max(0, quantity)]));
}

module.exports = { catalogStocks };
