const { Op, fn, col } = require('sequelize');

// Read-only storefront snapshot. Checkout still locks variants and rechecks stock transactionally.
async function catalogStocks(db, variantIds) {
    const ids = [...new Set(variantIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
    if (!ids.length) return new Map();
    const receipts = db.ReceiptDetail.findAll({
        where: { productDetailSizeId: { [Op.in]: ids } },
        attributes: ['productDetailSizeId', [fn('SUM', col('quantity')), 'quantity']],
        group: ['productDetailSizeId'], raw: true,
    });
    const sales = db.OrderDetail.findAll({
        where: { productId: { [Op.in]: ids } },
        attributes: ['productId', 'orderId', [fn('SUM', col('quantity')), 'quantity']],
        group: ['productId', 'orderId'], raw: true,
    }).then(async soldLines => {
        const orderIds = [...new Set(soldLines.map(line => Number(line.orderId)))];
        const orders = orderIds.length ? await db.OrderProduct.findAll({
            where: { id: { [Op.in]: orderIds }, statusId: { [Op.ne]: 'S7' } }, attributes: ['id'], raw: true,
        }) : [];
        return { soldLines, orders };
    });
    const returns = db.InventoryAdjustment ? db.InventoryAdjustment.findAll({
        where: { productDetailSizeId: { [Op.in]: ids } },
        attributes: ['productDetailSizeId', [fn('SUM', col('quantity')), 'quantity']],
        group: ['productDetailSizeId'], raw: true,
    }) : [];
    const counts = db.StockMovement ? db.StockMovement.findAll({
        where: { productDetailSizeId: { [Op.in]: ids } },
        attributes: ['productDetailSizeId', [fn('SUM', col('quantity')), 'quantity']],
        group: ['productDetailSizeId'], raw: true,
    }) : [];
    const reservations = db.PaymentSession.findAll({
        where: { status: 'PENDING', expiresAt: { [Op.gt]: new Date() } }, attributes: ['checkoutData'], raw: true,
    });
    // Independent aggregates stay fresh on every request without adding
    // one database round trip to the critical path for every inventory source.
    const [received, { soldLines, orders }, adjustments, movements, sessions] = await Promise.all([
        receipts, sales, returns, counts, reservations,
    ]);
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
