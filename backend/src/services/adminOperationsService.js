const { QueryTypes } = require('sequelize');
const { fail, positiveInteger, resultOf } = require('../utils/commerce');
const { createDeliveryService } = require('./deliveryService');

const ORDER_STATUSES = ['S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'];
const RETURN_STATUSES = ['REQUESTED', 'APPROVED', 'SHIPPED', 'REFUND_PENDING', 'REFUNDED', 'REJECTED'];
const DAY = 86400000;
const validId = value => ['number', 'string'].includes(typeof value) && positiveInteger(value);
const requireStaff = actor => { if (!actor || !validId(actor.id) || !['R1', 'R4'].includes(actor.roleId)) fail('Chỉ quản trị viên và nhân viên cửa hàng được truy cập trung tâm vận hành.', 403); };
const calendarDay = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Ngày lọc phải theo định dạng YYYY-MM-DD.');
    const time = Date.parse(`${value}T00:00:00+07:00`);
    if (!Number.isFinite(time) || new Date(time + 7 * 3600000).toISOString().slice(0, 10) !== value) fail('Ngày lọc không hợp lệ.');
    return time;
};
const localDay = time => new Date(time + 7 * 3600000).toISOString().slice(0, 10);
function dateRange(data, defaults = false, now = Date.now()) {
    const today = localDay(now);
    const from = data.from || (defaults ? localDay(calendarDay(today) - 29 * DAY) : '');
    const to = data.to || (defaults ? today : '');
    const start = from ? calendarDay(from) : null;
    const end = to ? calendarDay(to) + DAY : null;
    if (start !== null && end !== null && (start >= end || (end - start) / DAY > 366)) fail('Khoảng ngày phải tăng dần và không quá 366 ngày.');
    return { from, to, start, end, timezone: 'Asia/Ho_Chi_Minh', utcOffset: '+07:00' };
}
function pagination(data) {
    const page = data.page === undefined ? 1 : data.page;
    const pageSize = data.pageSize === undefined ? 20 : data.pageSize;
    if (!validId(page) || !validId(pageSize) || Number(pageSize) > 50 || Number(page) > 100000) fail('Phân trang không hợp lệ (tối đa 50 bản ghi mỗi trang).');
    return { page: Number(page), pageSize: Number(pageSize), offset: (Number(page) - 1) * Number(pageSize) };
}
function option(data, name, allowed) {
    const value = data[name] === undefined || data[name] === '' ? 'ALL' : data[name];
    if (typeof value !== 'string' || !['ALL', ...allowed].includes(value)) fail(`Bộ lọc ${name} không hợp lệ.`);
    return value;
}
function filters(data = {}) {
    const keyword = data.keyword === undefined ? '' : data.keyword;
    if (typeof keyword !== 'string' || keyword.trim().length > 100) fail('Từ khóa không hợp lệ hoặc dài quá 100 ký tự.');
    return { keyword: keyword.trim(), payment: option(data, 'payment', ['COD', 'ONLINE']),
        carrier: option(data, 'carrier', ['internal', 'ghn', 'ghtk']), ...dateRange(data) };
}
function whereFor(filter, dateColumn = 'o.createdAt') {
    const clauses = ['1=1']; const replacements = {};
    if (filter.keyword) {
        // Escape wildcard characters: a customer-entered % must not match every order.
        replacements.keyword = `%${filter.keyword.replace(/[!%_]/g, '!$&')}%`;
        replacements.orderId = /^\d+$/.test(filter.keyword) && validId(filter.keyword) ? Number(filter.keyword) : -1;
        clauses.push('(o.id = :orderId OR a.shipName LIKE :keyword ESCAPE \'!\' OR a.shipEmail LIKE :keyword ESCAPE \'!\' OR a.shipPhonenumber LIKE :keyword ESCAPE \'!\')');
    }
    if (filter.payment !== 'ALL') { clauses.push('o.isPaymentOnlien = :online'); replacements.online = filter.payment === 'ONLINE' ? 1 : 0; }
    if (filter.carrier !== 'ALL') { clauses.push("COALESCE(o.deliveryProvider, 'internal') = :carrier"); replacements.carrier = filter.carrier; }
    if (filter.start !== null) { clauses.push(`${dateColumn} >= :fromDate`); replacements.fromDate = new Date(filter.start); }
    if (filter.end !== null) { clauses.push(`${dateColumn} < :untilDate`); replacements.untilDate = new Date(filter.end); }
    return { sql: clauses.join(' AND '), replacements };
}
const orderProjection = `o.id, o.statusId, o.createdAt, o.deliveredAt, o.totalPrice, o.isPaymentOnlien,
    COALESCE(o.deliveryProvider, 'internal') AS deliveryProvider, o.shipperId, o.deliveryAttempts,
    a.shipName AS customerName, a.shipPhonenumber AS customerPhone, a.shipEmail AS customerEmail,
    s.trackingCode, s.status AS shipmentStatus, p.provider AS paymentProvider, p.status AS gatewayStatus,
    r.id AS returnRequestId, r.status AS returnStatus`;
const orderJoins = `LEFT JOIN AddressUsers a ON a.id = o.addressUserId
    LEFT JOIN Shipments s ON s.orderId = o.id
    LEFT JOIN PaymentSessions p ON p.orderId = o.id
    LEFT JOIN ReturnRequests r ON r.id = (SELECT MAX(rr.id) FROM ReturnRequests rr WHERE rr.orderId = o.id)`;
function safeOrder(row) {
    return { ...row, totalPrice: row.totalPrice == null ? null : Number(row.totalPrice),
        isPaymentOnlien: Number(row.isPaymentOnlien), deliveryAttempts: Number(row.deliveryAttempts) || 0,
        actions: { confirm: row.statusId === 'S3', assign: row.statusId === 'S4' && !Number(row.shipperId) && row.deliveryProvider === 'internal' && !row.shipmentStatus } };
}

function createAdminOperationsService(db, dependencies = {}) {
    const delivery = dependencies.delivery || createDeliveryService(db);
    const query = (sql, replacements = {}) => db.sequelize.query(sql, { type: QueryTypes.SELECT, replacements });
    const orders = (data = {}, actor) => resultOf(async () => {
        requireStaff(actor);
        const paging = pagination(data); const filter = filters(data); const status = option(data, 'status', ORDER_STATUSES);
        const base = whereFor(filter); const selected = `${base.sql}${status === 'ALL' ? '' : ' AND o.statusId = :status'}`;
        const replacements = { ...base.replacements, status, limit: paging.pageSize, offset: paging.offset };
        const [rows, totals, groups] = await Promise.all([
            query(`/* admin-orders-page */ SELECT ${orderProjection} FROM Orderproducts o ${orderJoins} WHERE ${selected} ORDER BY o.createdAt DESC, o.id DESC LIMIT :limit OFFSET :offset`, replacements),
            query(`/* admin-orders-count */ SELECT COUNT(*) AS count FROM Orderproducts o LEFT JOIN AddressUsers a ON a.id=o.addressUserId WHERE ${selected}`, replacements),
            query(`/* admin-orders-counters */ SELECT o.statusId, COUNT(*) AS count FROM Orderproducts o LEFT JOIN AddressUsers a ON a.id=o.addressUserId WHERE ${base.sql} GROUP BY o.statusId`, base.replacements),
        ]);
        const counters = Object.fromEntries(ORDER_STATUSES.map(code => [code, 0]));
        for (const group of groups) if (ORDER_STATUSES.includes(group.statusId)) counters[group.statusId] = Number(group.count) || 0;
        return { errCode: 0, data: rows.map(safeOrder), count: Number(totals[0]?.count) || 0,
            page: paging.page, pageSize: paging.pageSize, counters, filters: { keyword: filter.keyword, payment: filter.payment, carrier: filter.carrier, status, from: filter.from, to: filter.to, utcOffset: '+07:00' } };
    });

    const returns = (data = {}, actor) => resultOf(async () => {
        requireStaff(actor);
        const paging = pagination(data); const filter = filters(data); const status = option(data, 'status', RETURN_STATUSES);
        const base = whereFor(filter, 'r.requestedAt'); const selected = `${base.sql}${status === 'ALL' ? '' : ' AND r.status = :status'}`;
        const replacements = { ...base.replacements, status, limit: paging.pageSize, offset: paging.offset };
        const joins = 'JOIN Orderproducts o ON o.id=r.orderId LEFT JOIN AddressUsers a ON a.id=o.addressUserId';
        const [rows, totals, groups] = await Promise.all([
            query(`/* admin-returns-page */ SELECT r.id, r.orderId, r.kind, r.status, r.reason, r.amount, r.requestedAt, r.receivedAt, r.refundedAt, r.refundMethod, r.refundProviderStatus, r.carrier, r.trackingNumber, o.isPaymentOnlien, a.shipName AS customerName, a.shipPhonenumber AS customerPhone FROM ReturnRequests r ${joins} WHERE ${selected} ORDER BY r.requestedAt DESC, r.id DESC LIMIT :limit OFFSET :offset`, replacements),
            query(`/* admin-returns-count */ SELECT COUNT(*) AS count FROM ReturnRequests r ${joins} WHERE ${selected}`, replacements),
            query(`/* admin-returns-counters */ SELECT r.status, COUNT(*) AS count FROM ReturnRequests r ${joins} WHERE ${base.sql} GROUP BY r.status`, base.replacements),
        ]);
        const counters = Object.fromEntries(RETURN_STATUSES.map(code => [code, 0]));
        for (const group of groups) if (RETURN_STATUSES.includes(group.status)) counters[group.status] = Number(group.count) || 0;
        return { errCode: 0, data: rows.map(row => ({ ...row, amount: Number(row.amount), isPaymentOnlien: Number(row.isPaymentOnlien) })),
            count: Number(totals[0]?.count) || 0, page: paging.page, pageSize: paging.pageSize, counters,
            filters: { status, keyword: filter.keyword, from: filter.from, to: filter.to, utcOffset: '+07:00' } };
    });

    const bulk = (data = {}, actor) => resultOf(async () => {
        requireStaff(actor);
        if (!['CONFIRM', 'ASSIGN'].includes(data.action) || !Array.isArray(data.orderIds) || !data.orderIds.length || data.orderIds.length > 50 ||
            data.orderIds.some(id => !validId(id)) || new Set(data.orderIds.map(Number)).size !== data.orderIds.length) fail('Chọn từ 1 đến 50 mã đơn khác nhau và thao tác hợp lệ.');
        if (data.action === 'ASSIGN' && !validId(data.shipperId)) fail('Vui lòng chọn người giao hàng đang hoạt động.');
        const results = [];
        // Each row has its own existing locked transaction; invalid/stale rows
        // cannot bypass delivery invariants or undo successful independent rows.
        for (const id of data.orderIds) {
            let result;
            try {
                result = data.action === 'CONFIRM'
                    ? await delivery.updateStatusOrder({ id: Number(id), statusId: 'S4' }, actor)
                    : await delivery.confirmOrder({ orderId: Number(id), statusId: 'S5', shipperId: Number(data.shipperId) }, actor);
            } catch (error) {
                result = { errCode: 500, errMessage: 'Không thể xử lý đơn này. Tải lại trạng thái đơn trước khi thử lại.' };
            }
            results.push({ orderId: Number(id), errCode: result.errCode, errMessage: result.errMessage,
                ...(result.errCode === 0 ? { statusId: result.data?.statusId } : {}) });
        }
        const succeeded = results.filter(row => row.errCode === 0).length;
        return { errCode: 0, results, succeeded, failed: results.length - succeeded,
            errMessage: `Đã xử lý ${succeeded}/${results.length} đơn hàng. Các đơn không phù hợp được giữ nguyên.` };
    });

    const dashboard = (data = {}, actor) => resultOf(async () => {
        requireStaff(actor);
        const range = dateRange(data, true, dependencies.now ? dependencies.now() : Date.now());
        const replacements = { fromDate: new Date(range.start), untilDate: new Date(range.end) };
        const inventory = dependencies.inventory || require('./adminInventoryService').createAdminInventoryService(db);
        const [sales, groups, returnGroups, refunds, recent, trend, stock] = await Promise.all([
            query(`/* admin-dashboard-sales */ SELECT COUNT(*) AS deliveredOrders, SUM(o.totalPrice) AS grossRevenue,
                SUM(COALESCE(r.refundAmount,0)) AS refundsAgainstDeliveredOrders, SUM(o.totalPrice IS NULL) AS missingRecordedTotals
                FROM Orderproducts o LEFT JOIN (SELECT orderId,SUM(amount) AS refundAmount FROM ReturnRequests WHERE status='REFUNDED' GROUP BY orderId) r ON r.orderId=o.id
                WHERE o.statusId='S6' AND o.deliveredAt >= :fromDate AND o.deliveredAt < :untilDate`, replacements),
            query("/* admin-dashboard-queues */ SELECT statusId, COUNT(*) AS count FROM Orderproducts GROUP BY statusId"),
            query("/* admin-dashboard-returns */ SELECT status, COUNT(*) AS count FROM ReturnRequests GROUP BY status"),
            query("/* admin-dashboard-refunds */ SELECT COUNT(*) AS count,SUM(amount) AS amount FROM ReturnRequests WHERE status='REFUNDED' AND refundedAt >= :fromDate AND refundedAt < :untilDate", replacements),
            query(`/* admin-dashboard-recent */ SELECT ${orderProjection} FROM Orderproducts o ${orderJoins} ORDER BY o.createdAt DESC,o.id DESC LIMIT 8`),
            query(`/* admin-dashboard-trend */ SELECT DATE(o.deliveredAt) AS day, COUNT(*) AS orders,
                SUM(o.totalPrice) AS grossRevenue, SUM(COALESCE(r.refundAmount,0)) AS refunds
                FROM Orderproducts o LEFT JOIN (SELECT orderId,SUM(amount) AS refundAmount FROM ReturnRequests WHERE status='REFUNDED' GROUP BY orderId) r ON r.orderId=o.id
                WHERE o.statusId='S6' AND o.deliveredAt >= :fromDate AND o.deliveredAt < :untilDate GROUP BY DATE(o.deliveredAt) ORDER BY day`, replacements),
            inventory.summary(actor),
        ]);
        const salesRow = sales[0] || {}; const refundRow = refunds[0] || {};
        const queues = Object.fromEntries(ORDER_STATUSES.map(code => [code, 0]));
        groups.forEach(row => { if (ORDER_STATUSES.includes(row.statusId)) queues[row.statusId] = Number(row.count) || 0; });
        const returnQueues = Object.fromEntries(RETURN_STATUSES.map(code => [code, 0]));
        returnGroups.forEach(row => { if (RETURN_STATUSES.includes(row.status)) returnQueues[row.status] = Number(row.count) || 0; });
        const trendByDay = new Map(trend.map(row => [String(row.day).slice(0, 10), row]));
        const dailyTrend = [];
        for (let time = range.start; time < range.end; time += DAY) {
            const day = localDay(time); const row = trendByDay.get(day) || {};
            dailyTrend.push({ day, orders: Number(row.orders) || 0, grossRevenue: Number(row.grossRevenue) || 0,
                refunds: Number(row.refunds) || 0, netRevenue: (Number(row.grossRevenue) || 0) - (Number(row.refunds) || 0) });
        }
        const grossRevenue = Number(salesRow.grossRevenue) || 0;
        const refundsAgainstDeliveredOrders = Number(salesRow.refundsAgainstDeliveredOrders) || 0;
        if (stock.errCode !== 0) fail(stock.errMessage || 'Không thể tải tồn kho vận hành.');
        const financialAccess = actor.roleId === 'R1';
        return { errCode: 0, data: { range: { from: range.from, to: range.to, utcOffset: '+07:00' }, financialAccess,
            metrics: { deliveredOrders: Number(salesRow.deliveredOrders) || 0,
                ...(financialAccess ? { grossRevenue, refundsAgainstDeliveredOrders, netRevenue: grossRevenue - refundsAgainstDeliveredOrders,
                    missingRecordedTotals: Number(salesRow.missingRecordedTotals) || 0,
                    refundedInPeriod: Number(refundRow.amount) || 0, refundCountInPeriod: Number(refundRow.count) || 0 } : {}) },
            queues, returnQueues, recentOrders: recent.map(safeOrder),
            stock: { ...stock.data, lowStock: stock.lowStock || [] },
            dailyTrend: financialAccess ? dailyTrend : dailyTrend.map(({ day, orders }) => ({ day, orders })),
            semantics: { revenue: 'Đơn đã giao trong khoảng ngày giao (UTC+7), trừ khoản hoàn đã xác nhận của chính các đơn đó. Chưa trừ giá vốn và chi phí vận hành.',
                refunds: 'Khoản hoàn đã xác nhận theo ngày hoàn trong kỳ; khoản đang chờ không được tính là đã hoàn.',
                queues: 'Số đơn và yêu cầu trả hàng đang ở từng trạng thái trên toàn hệ thống tại thời điểm tải.' } } };
    });
    return { orders, returns, bulk, dashboard };
}
module.exports = { createAdminOperationsService, dateRange, pagination, safeOrder };
