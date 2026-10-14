import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOperationsDashboard } from '../../../services/adminOperationsService';
import { ORDER_STATUSES } from '../../../utils/orders';
import { orderMoney, operationDate, recentRange, useOperationsQuery } from './operationsShared';
import './Operations.scss';

function reportRangeValidation(draft) {
    const parseDay = value => {
        const time = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00+07:00`) : NaN;
        return Number.isFinite(time) && new Date(time + 7 * 3600000).toISOString().slice(0, 10) === value ? time : NaN;
    };
    const from = parseDay(draft.from); const to = parseDay(draft.to);
    if (!Number.isFinite(from)) return { field: 'from', message: 'Vui lòng chọn ngày bắt đầu hợp lệ.' };
    if (!Number.isFinite(to)) return { field: 'to', message: 'Vui lòng chọn ngày kết thúc hợp lệ.' };
    if (to < from) return { field: 'to', message: 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.' };
    if ((to - from) / 86400000 + 1 > 366) return { field: 'to', message: 'Vui lòng chọn kỳ báo cáo không quá 366 ngày.' };
    return null;
}

function DailyTrend({ rows, financialAccess }) {
    const values = rows.map(row => Number(financialAccess ? row.netRevenue : row.orders) || 0);
    const min = Math.min(0, ...values); const max = Math.max(1, ...values); const scale = max - min;
    const point = (value, index) => `${24 + index * 652 / Math.max(1, values.length - 1)},${155 - (value - min) * 130 / scale}`;
    const zero = 155 - (0 - min) * 130 / scale;
    return <div className="operations-trend"><svg role="img" aria-label={financialAccess ? 'Doanh thu sau hoàn theo ngày giao trong kỳ' : 'Số đơn đã giao theo ngày trong kỳ'} viewBox="0 0 700 185"><title>{financialAccess ? 'Doanh thu sau hoàn' : 'Đơn đã giao'} theo ngày</title><line x1="24" x2="676" y1={zero} y2={zero} stroke="#dfe4ef" /><polyline points={values.map(point).join(' ')} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><text x="24" y="179" fill="#6b7280" fontSize="11">{rows[0]?.day}</text><text x="676" y="179" textAnchor="end" fill="#6b7280" fontSize="11">{rows[rows.length - 1]?.day}</text></svg><div className="operations-trend-scale"><span>Thấp nhất: {financialAccess ? orderMoney(min) : min}</span><span>Cao nhất: {financialAccess ? orderMoney(max === 1 && !values.some(Boolean) ? 0 : max) : max === 1 && !values.some(Boolean) ? 0 : max}</span></div><details><summary>Xem số liệu theo ngày</summary><div className="operations-table-scroll"><table className="operations-table"><thead><tr><th>Ngày (UTC+7)</th><th>Đơn đã giao</th>{financialAccess && <><th>Trước hoàn</th><th>Đã hoàn</th><th>Sau hoàn</th></>}</tr></thead><tbody>{rows.map(row => <tr key={row.day}><td>{row.day}</td><td>{row.orders}</td>{financialAccess && <><td>{orderMoney(row.grossRevenue)}</td><td>{orderMoney(row.refunds)}</td><td>{orderMoney(row.netRevenue)}</td></>}</tr>)}</tbody></table></div></details></div>;
}
export default function OperationsDashboard() {
    const [draft, setDraft] = useState(recentRange); const [range, setRange] = useState(recentRange);
    const [rangeError, setRangeError] = useState(null);
    const fromRef = useRef(null); const toRef = useRef(null);
    const params = useMemo(() => range, [range]);
    const { response, loading, error, reload } = useOperationsQuery(getOperationsDashboard, params);
    const data = response?.data; const queue = data?.queues || {}; const returns = data?.returnQueues || {};
    const pendingReturns = ['REQUESTED', 'APPROVED', 'SHIPPED', 'REFUND_PENDING'].reduce((sum, status) => sum + (Number(returns[status]) || 0), 0);
    const updateDraft = (field, value) => { setDraft(old => ({ ...old, [field]: value })); setRangeError(null); };
    const applyRange = event => {
        event.preventDefault();
        if (loading) return;
        const invalid = reportRangeValidation(draft);
        setRangeError(invalid);
        if (invalid) { (invalid.field === 'from' ? fromRef : toRef).current?.focus(); return; }
        setRange({ ...draft });
    };
    return <main className="admin-operations admin-workspace-page">
        <div className="operations-page-heading"><div><p className="operations-eyebrow">Tổng quan cửa hàng</p><h1>Trung tâm vận hành</h1><p>Đơn hàng, hàng hoàn và tồn kho cần xử lý trong hôm nay.</p></div><button type="button" className="btn btn-outline-secondary" disabled={loading} onClick={reload}>Làm mới dữ liệu</button></div>
        <form className="operations-range" aria-label="Chọn kỳ báo cáo" noValidate onSubmit={applyRange}>
            <label htmlFor="operations-range-from">Từ ngày<input ref={fromRef} id="operations-range-from" type="date" value={draft.from} required aria-invalid={rangeError?.field === 'from' || undefined} aria-describedby={rangeError?.field === 'from' ? 'operations-range-help operations-range-error' : 'operations-range-help'} onChange={event => updateDraft('from', event.target.value)} /></label>
            <label htmlFor="operations-range-to">Đến ngày<input ref={toRef} id="operations-range-to" type="date" min={draft.from || undefined} value={draft.to} required aria-invalid={rangeError?.field === 'to' || undefined} aria-describedby={rangeError?.field === 'to' ? 'operations-range-help operations-range-error' : 'operations-range-help'} onChange={event => updateDraft('to', event.target.value)} /></label>
            <button type="submit" className="btn btn-primary" disabled={loading}>Xem kỳ báo cáo</button>
            <div className="operations-range-help"><small id="operations-range-help">Ngày giao và ngày hoàn theo UTC+7 · Tối đa 366 ngày</small><span role="status" className="operations-range-status">{loading && data ? 'Đang cập nhật tổng quan vận hành…' : ''}</span></div>
            {rangeError && <p id="operations-range-error" className="operations-range-error" role="alert">{rangeError.message}</p>}
        </form>
        {loading && !data && <p role="status" className="operations-loading">Đang tải tổng quan vận hành…</p>}
        {error && <div role="alert" className="operations-error"><p>{error}</p><button type="button" onClick={reload}>Thử lại</button></div>}
        {data && <>
            <div className={`operations-kpi-grid${data.financialAccess ? '' : ' operations-kpi-grid-staff'}`}>
                {data.financialAccess && <article className="operations-kpi"><span>Doanh thu sau hoàn</span><strong>{orderMoney(data.metrics.netRevenue)}</strong><small>Đơn giao trong kỳ · đã trừ khoản hoàn xác nhận</small></article>}
                <article className="operations-kpi"><span>Đơn giao trong kỳ</span><strong>{data.metrics.deliveredOrders}</strong><small>{data.range.from} → {data.range.to}</small></article>
                <article className="operations-kpi"><span>Đơn chờ xác nhận</span><strong>{queue.S3 || 0}</strong><Link to="/system/home/list-order?status=S3">Xử lý đơn mới →</Link></article>
                <article className="operations-kpi"><span>Yêu cầu trả hàng đang mở</span><strong>{pendingReturns}</strong><Link to="/system/home/returns">Xem hàng đợi →</Link></article>
            </div>
            {data.metrics.missingRecordedTotals > 0 && <p className="operations-notice">Có {data.metrics.missingRecordedTotals} đơn cũ chưa lưu tổng tiền; doanh thu chưa bao gồm tổng tiền của các đơn này.</p>}
            {data.metrics.legacyDeliveryDates > 0 && <p className="operations-notice">Có {data.metrics.legacyDeliveryDates} đơn cũ chưa lưu ngày giao riêng; báo cáo dùng ngày cập nhật cuối của các đơn này. Ngày giao cũ có thể không chính xác nếu đơn từng được sửa sau giao.</p>}
            <div className="operations-dashboard-grid"><section className="operations-panel"><div className="operations-panel-title"><h2>{data.financialAccess ? 'Doanh thu theo ngày giao' : 'Đơn giao theo ngày'}</h2><span>{data.range.from} → {data.range.to}</span></div><DailyTrend rows={data.dailyTrend || []} financialAccess={data.financialAccess} /><p className="operations-explanation">{data.financialAccess ? data.semantics.revenue : 'Số đơn có trạng thái đã giao và ngày giao nằm trong kỳ được chọn.'}</p>{data.financialAccess && <div className="operations-finance-detail"><span>Trước hoàn: <strong>{orderMoney(data.metrics.grossRevenue)}</strong></span><span>Hoàn của đơn giao trong kỳ: <strong>{orderMoney(data.metrics.refundsAgainstDeliveredOrders)}</strong></span><span>Hoàn xác nhận theo ngày hoàn trong kỳ: <strong>{orderMoney(data.metrics.refundedInPeriod)}</strong></span></div>}</section>
                <section className="operations-panel"><div className="operations-panel-title"><h2>Cần xử lý</h2><span>Toàn hệ thống hiện tại</span></div><div className="operations-action-queue">{['S3', 'S4', 'S5', 'S8', 'S9'].map(status => <Link key={status} to={`/system/home/list-order?status=${status}`}><span>{ORDER_STATUSES[status]}</span><strong>{queue[status] || 0}</strong><span aria-hidden="true">→</span></Link>)}<Link to="/system/home/returns?status=REFUND_PENDING"><span>Đang chờ hoàn tiền</span><strong>{returns.REFUND_PENDING || 0}</strong><span aria-hidden="true">→</span></Link></div><p className="operations-explanation">{data.semantics.queues}</p></section></div>
            <div className="operations-dashboard-grid"><section className="operations-panel"><div className="operations-panel-title"><h2>Đơn đặt gần đây</h2><Link to="/system/home/list-order">Tất cả đơn →</Link></div><div className="operations-table-scroll"><table className="operations-table"><thead><tr><th>Đơn / người nhận</th><th>Trạng thái</th><th>Tổng tiền</th></tr></thead><tbody>{!data.recentOrders.length && <tr><td colSpan={3} className="operations-empty">Chưa có đơn hàng.</td></tr>}{data.recentOrders.map(row => <tr key={row.id}><td><Link to={`/system/home/order-detail/${row.id}`}>#{row.id} · {row.customerName || '—'}</Link><small>{operationDate(row.createdAt)}</small></td><td><span className={`operations-status status-${row.statusId}`}>{ORDER_STATUSES[row.statusId] || row.statusId}</span></td><td>{orderMoney(row.totalPrice)}</td></tr>)}</tbody></table></div></section>
                <section className="operations-panel"><div className="operations-panel-title"><h2>Cảnh báo tồn kho</h2><Link to="/system/home/inventory">Quản lý kho →</Link></div><div className="operations-stock-counts"><div><span>Sắp hết (≤ 5)</span><strong>{data.stock.low}</strong></div><div><span>Hết hàng</span><strong>{data.stock.out}</strong></div></div><p className="operations-explanation">Số lượng có thể bán đã trừ phần đang đặt giữ cho thanh toán.</p><div className="operations-action-queue">{!data.stock.lowStock.length && <p className="operations-empty">Chưa có biến thể dưới ngưỡng cảnh báo.</p>}{data.stock.lowStock.map(row => <Link to={`/system/home/inventory?keyword=${encodeURIComponent(row.productName || '')}`} key={row.variantId}><span>{row.productName}<small>{[row.variantName, row.size, row.sku].filter(Boolean).join(' · ')}</small></span><strong>{row.available}</strong><span aria-hidden="true">→</span></Link>)}</div></section></div>
        </>}
    </main>;
}
