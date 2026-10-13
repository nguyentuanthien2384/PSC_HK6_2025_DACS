const crypto = require('crypto');
const { Op, QueryTypes } = require('sequelize');
const { fail, resultOf } = require('../utils/commerce');
const { createCommerceService } = require('./commerceService');
const { recordAdminAudit } = require('./adminAuditService');

const validInteger = value => ['number', 'string'].includes(typeof value) && String(value).trim() !== '' && Number.isSafeInteger(Number(value));
const validId = value => validInteger(value) && Number(value) > 0;
const requireStaff = actor => {
    if (!actor || !validId(actor.id) || !['R1', 'R4'].includes(actor.roleId)) fail('Bạn không có quyền quản lý kho.', 403);
};
const pagination = query => {
    const limit = query.limit === undefined ? 25 : Number(query.limit);
    const offset = query.offset === undefined ? 0 : Number(query.offset);
    if (!validInteger(query.limit === undefined ? limit : query.limit) || limit < 1 || limit > 100 ||
        !validInteger(query.offset === undefined ? offset : query.offset) || offset < 0 || offset > 1000000) fail('Phân trang không hợp lệ.');
    return { limit, offset };
};
const thresholdOf = query => {
    const threshold = query.threshold === undefined ? 5 : Number(query.threshold);
    if (!validInteger(query.threshold === undefined ? threshold : query.threshold) || threshold < 0 || threshold > 10000) fail('Ngưỡng cảnh báo kho không hợp lệ.');
    return threshold;
};

function createAdminInventoryService(db, dependencies = {}) {
    const commerce = dependencies.commerce || createCommerceService(db);
    const recordAudit = dependencies.recordAudit || recordAdminAudit;
    const quoteTable = model => db.sequelize.getQueryInterface().queryGenerator.quoteTable(model.getTableName());
    // A single aggregate query loads small variant metadata, never product HTML
    // or image blobs. Pending gateway reservations are deducted before filtering
    // and pagination, so a low-stock page cannot silently omit reserved variants.
    async function snapshotRows(query = {}) {
        const threshold = thresholdOf(query);
        const search = query.search === undefined ? '' : query.search;
        if (typeof search !== 'string' || search.trim().length > 150) fail('Từ khóa tìm kho không hợp lệ.');
        if (query.categoryId !== undefined && (typeof query.categoryId !== 'string' || query.categoryId.length > 50)) fail('Danh mục không hợp lệ.');
        if (query.statusId !== undefined && !['', 'S1', 'S2'].includes(query.statusId)) fail('Trạng thái sản phẩm không hợp lệ.');
        if (query.stock !== undefined && !['all', 'low', 'out'].includes(query.stock)) fail('Bộ lọc tồn kho không hợp lệ.');
        const clauses = [], replacements = {};
        if (search.trim()) {
            clauses.push('(LOWER(p.name) LIKE :search OR LOWER(d.nameDetail) LIKE :search OR CAST(v.id AS CHAR) = :variantId)');
            replacements.search = `%${search.trim().toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
            replacements.variantId = search.trim().replace(/^SKU-/i, '');
        }
        if (query.categoryId) { clauses.push('p.categoryId = :categoryId'); replacements.categoryId = query.categoryId; }
        if (query.statusId) { clauses.push('p.statusId = :statusId'); replacements.statusId = query.statusId; }
        const rows = await db.sequelize.query(`SELECT v.id AS variantId, p.id AS productId, p.name AS productName,
            d.nameDetail AS variantName, v.sizeId, p.categoryId, p.statusId,
            COALESCE(received.quantity,0) + COALESCE(credits.quantity,0) + COALESCE(movements.quantity,0) - COALESCE(sales.quantity,0) AS onHand
            FROM ${quoteTable(db.ProductDetailSize)} v
            INNER JOIN ${quoteTable(db.ProductDetail)} d ON d.id = v.productdetailId
            INNER JOIN ${quoteTable(db.Product)} p ON p.id = d.productId
            LEFT JOIN (SELECT productDetailSizeId, SUM(quantity) AS quantity FROM ${quoteTable(db.ReceiptDetail)} GROUP BY productDetailSizeId) received ON received.productDetailSizeId = v.id
            LEFT JOIN (SELECT productDetailSizeId, SUM(quantity) AS quantity FROM ${quoteTable(db.InventoryAdjustment)} GROUP BY productDetailSizeId) credits ON credits.productDetailSizeId = v.id
            LEFT JOIN (SELECT productDetailSizeId, SUM(quantity) AS quantity FROM ${quoteTable(db.StockMovement)} GROUP BY productDetailSizeId) movements ON movements.productDetailSizeId = v.id
            LEFT JOIN (SELECT order_lines.productId, SUM(order_lines.quantity) AS quantity FROM ${quoteTable(db.OrderDetail)} order_lines
                INNER JOIN ${quoteTable(db.OrderProduct)} placed_orders ON placed_orders.id = order_lines.orderId AND placed_orders.statusId <> 'S7'
                GROUP BY order_lines.productId) sales ON sales.productId = v.id
            ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY p.name ASC, v.id ASC`, { replacements, type: QueryTypes.SELECT });
        const [sessions, codes] = await Promise.all([
            db.PaymentSession.findAll({ where: { status: 'PENDING', expiresAt: { [Op.gt]: new Date() } }, attributes: ['checkoutData'], raw: true }),
            db.Allcode.findAll({ attributes: ['code', 'value', 'type'], where: { type: { [Op.in]: ['SIZE', 'CATEGORY'] } }, raw: true })
        ]);
        const reserved = new Map();
        for (const session of sessions) {
            const checkout = JSON.parse(session.checkoutData);
            for (const line of checkout.lines || []) reserved.set(Number(line.productId), (reserved.get(Number(line.productId)) || 0) + Number(line.quantity));
        }
        const codeMap = new Map(codes.map(code => [code.code, code.value]));
        const variants = rows.map(row => {
            const onHand = Number(row.onHand), held = reserved.get(Number(row.variantId)) || 0;
            return { ...row, variantId: Number(row.variantId), productId: Number(row.productId), sku: `SKU-${row.variantId}`,
                size: codeMap.get(row.sizeId) || row.sizeId, categoryName: codeMap.get(row.categoryId) || row.categoryId,
                onHand, reserved: held, available: Math.max(0, onHand - held) };
        });
        const summary = { variants: variants.length, onHand: 0, reserved: 0, available: 0, low: 0, out: 0 };
        for (const row of variants) {
            summary.onHand += row.onHand; summary.reserved += row.reserved; summary.available += row.available;
            if (row.available <= 0) summary.out++;
            else if (row.available <= threshold) summary.low++;
        }
        const filtered = variants.filter(row => query.stock === 'out' ? row.available <= 0 : query.stock === 'low' ? row.available > 0 && row.available <= threshold : true);
        return { variants, filtered, summary, threshold, categories: codes.filter(code => code.type === 'CATEGORY').map(({ code, value }) => ({ code, value })) };
    }

    const list = (query = {}, actor) => resultOf(async () => {
        requireStaff(actor); const { limit, offset } = pagination(query);
        const snapshot = await snapshotRows(query);
        return { errCode: 0, data: snapshot.filtered.slice(offset, offset + limit), count: snapshot.filtered.length,
            summary: snapshot.summary, threshold: snapshot.threshold, categories: snapshot.categories };
    });
    const summary = (actor, query = {}) => resultOf(async () => {
        requireStaff(actor); const snapshot = await snapshotRows(query);
        return { errCode: 0, data: snapshot.summary, lowStock: snapshot.variants.filter(row => row.available <= snapshot.threshold)
            .sort((left, right) => left.available - right.available || left.variantId - right.variantId).slice(0, 8) };
    });
    const history = (query = {}, actor) => resultOf(async () => {
        requireStaff(actor); if (!validId(query.variantId)) fail('Mã biến thể không hợp lệ.');
        const { limit, offset } = pagination(query);
        const variant = await db.ProductDetailSize.findByPk(Number(query.variantId), { attributes: ['id'], raw: true });
        if (!variant) fail('Biến thể không tồn tại.', 2);
        const { rows, count } = await db.StockMovement.findAndCountAll({ where: { productDetailSizeId: Number(query.variantId) },
            attributes: { exclude: ['idempotencyKey'] }, order: [['id', 'DESC']], limit, offset, raw: true });
        const ids = [...new Set(rows.map(row => row.actorId))];
        const actors = ids.length ? await db.User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'firstName', 'lastName'], raw: true }) : [];
        const names = new Map(actors.map(user => [Number(user.id), `${user.firstName || ''} ${user.lastName || ''}`.trim()]));
        return { errCode: 0, data: rows.map(row => ({ ...row, actorName: names.get(Number(row.actorId)) || `Nhân viên #${row.actorId}` })), count };
    });
    const countStock = (data = {}, actor) => resultOf(async () => {
        requireStaff(actor);
        if (!validId(data.variantId) || !validInteger(data.targetOnHand) || Number(data.targetOnHand) < 0 || Number(data.targetOnHand) > 2147483647 ||
            !validInteger(data.expectedOnHand) || Math.abs(Number(data.expectedOnHand)) > 2147483647) fail('Số lượng kiểm kê phải là số nguyên hợp lệ.');
        if (typeof data.reason !== 'string' || data.reason.trim().length < 3 || data.reason.trim().length > 1000) fail('Lý do kiểm kê phải có từ 3 đến 1000 ký tự.');
        if (typeof data.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(data.idempotencyKey)) fail('Mã xác nhận kiểm kê không hợp lệ.');
        const variantId = Number(data.variantId), target = Number(data.targetOnHand), expected = Number(data.expectedOnHand), reason = data.reason.trim();
        const key = crypto.createHash('sha256').update(`${actor.id}:${data.idempotencyKey}`).digest('hex');
        return commerce.transaction(async tx => {
            await commerce.lockVariants([{ productId: variantId }], tx);
            const previous = await db.StockMovement.findOne({ where: { idempotencyKey: key }, transaction: tx, raw: true });
            if (previous) {
                if (Number(previous.productDetailSizeId) !== variantId || Number(previous.onHandAfter) !== target || Number(previous.onHandBefore) !== expected || previous.reason !== reason) fail('Mã kiểm kê đã được dùng cho nội dung khác. Tải lại và tạo lần kiểm kê mới.', 2);
                const { idempotencyKey, ...safe } = previous;
                return { errCode: 0, errMessage: 'Lần kiểm kê này đã được ghi nhận.', data: safe, repeated: true };
            }
            const snapshot = await commerce.stockSnapshot(variantId, tx);
            if (snapshot.onHand !== expected) fail('Tồn kho đã thay đổi sau khi bạn mở kiểm kê. Tải lại trước khi xác nhận.', 2, { current: snapshot });
            if (target < snapshot.reserved) fail(`Có ${snapshot.reserved} sản phẩm đang được giữ cho thanh toán. Không thể giảm tồn xuống dưới số lượng này.`, 2, { current: snapshot });
            const quantity = target - snapshot.onHand;
            if (!Number.isSafeInteger(quantity) || !quantity || Math.abs(quantity) > 2147483647) fail('Số kiểm kê phải khác tồn hiện tại và nằm trong giới hạn cho phép.');
            const movement = await db.StockMovement.create({ productDetailSizeId: variantId, actorId: Number(actor.id), quantity,
                onHandBefore: snapshot.onHand, onHandAfter: target, reservedAtCount: snapshot.reserved, reason, idempotencyKey: key }, { transaction: tx });
            await recordAudit(db, { actor, entityType: 'INVENTORY', entityId: variantId, action: 'STOCK_COUNT',
                summary: `Kiểm kê SKU-${variantId}: ${snapshot.onHand} → ${target}. ${reason}`,
                before: { onHand: snapshot.onHand, reserved: snapshot.reserved }, after: { onHand: target, quantity } }, tx);
            const { idempotencyKey, ...safe } = movement.get ? movement.get({ plain: true }) : movement;
            return { errCode: 0, errMessage: 'Đã lưu kiểm kê và lịch sử thay đổi tồn kho.', data: safe };
        }).catch(error => {
            if (error.name === 'SequelizeUniqueConstraintError') fail('Mã kiểm kê đã được ghi nhận cho một yêu cầu khác. Vui lòng tải lại.', 2);
            throw error;
        });
    });
    return { list, summary, history, countStock };
}
module.exports = { createAdminInventoryService };
