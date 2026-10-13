import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getOperationsReturns } from '../../../services/adminOperationsService';
import { RETURN_STATUSES } from '../../../utils/orders';
import { operationDate, orderMoney, useOperationsQuery } from './operationsShared';
import './Operations.scss';

export default function OperationsReturns() {
    const [search] = useSearchParams();
    const initial = { status: RETURN_STATUSES[search.get('status')] ? search.get('status') : 'ALL', keyword: '', from: '', to: '' };
    const [draft, setDraft] = useState(initial); const [filters, setFilters] = useState(initial); const [page, setPage] = useState(1);
    const params = useMemo(() => ({ ...filters, page, pageSize: 20 }), [filters, page]);
    const { response, loading, error, reload } = useOperationsQuery(getOperationsReturns, params);
    const rows = response?.data || []; const count = Number(response?.count) || 0;
    const change = (name, value) => setDraft(old => ({ ...old, [name]: value }));
    return <main className="admin-operations admin-workspace-page">
        <div className="operations-page-heading"><div><p className="operations-eyebrow">Chăm sóc sau bán</p><h1>Trả hàng và hoàn tiền</h1><p>Theo dõi yêu cầu, hàng thực nhận và khoản hoàn đã xác nhận.</p></div><button type="button" className="btn btn-outline-secondary" disabled={loading} onClick={reload}>Làm mới</button></div>
        <div className="operations-state-tabs" aria-label="Số yêu cầu theo trạng thái">{Object.entries(RETURN_STATUSES).map(([status, label]) => <button key={status} type="button" aria-pressed={filters.status === status} onClick={() => { setPage(1); setFilters(old => ({ ...old, status })); setDraft(old => ({ ...old, status })); }}>{label}<strong>{response?.counters?.[status] ?? '—'}</strong></button>)}</div>
        <form className="operations-filter-panel" onSubmit={event => { event.preventDefault(); setPage(1); setFilters({ ...draft }); }}>
            <label className="operations-search">Tìm đơn hoặc khách hàng<input value={draft.keyword} maxLength={100} placeholder="Mã đơn, tên, email hoặc điện thoại" onChange={event => change('keyword', event.target.value)} /></label>
            <label>Trạng thái trả hàng<select value={draft.status} onChange={event => change('status', event.target.value)}><option value="ALL">Tất cả yêu cầu</option>{Object.entries(RETURN_STATUSES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
            <label>Từ ngày yêu cầu<input type="date" value={draft.from} onChange={event => change('from', event.target.value)} /></label><label>Đến ngày yêu cầu<input type="date" value={draft.to} min={draft.from || undefined} onChange={event => change('to', event.target.value)} /></label>
            <button className="btn btn-primary" type="submit">Áp dụng bộ lọc</button><button className="btn btn-outline-secondary" type="button" onClick={() => { const clean = { status: 'ALL', keyword: '', from: '', to: '' }; setDraft(clean); setFilters(clean); setPage(1); }}>Xóa bộ lọc</button><small>Ngày yêu cầu tính theo UTC+7. Hoàn tiền đang chờ xác minh được giữ ở trạng thái chờ.</small>
        </form>
        <section className="operations-panel" aria-label="Hàng đợi trả hàng"><div className="operations-table-toolbar"><strong>{count} yêu cầu</strong><span>Trang {page}</span></div>
            {loading && <p role="status" className="operations-loading">Đang tải yêu cầu trả hàng…</p>}{error && <div role="alert" className="operations-error"><p>{error}</p><button type="button" onClick={reload}>Thử lại</button></div>}
            {!loading && !error && <div className="operations-table-scroll"><table className="operations-table"><thead><tr><th>Yêu cầu / đơn</th><th>Khách hàng</th><th>Lý do</th><th>Khoản hoàn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
                {!rows.length && <tr><td colSpan={6} className="operations-empty">Không có yêu cầu phù hợp bộ lọc.</td></tr>}
                {rows.map(row => <tr key={row.id}><td><strong>Yêu cầu #{row.id}</strong><small>Đơn #{row.orderId} · {operationDate(row.requestedAt)}</small></td><td>{row.customerName || '—'}<small>{row.customerPhone || '—'}</small></td><td className="operations-reason">{row.reason}<small>{row.kind === 'UNDELIVERED' ? 'Đơn giao không thành công, đã nhận về kho' : 'Khách yêu cầu trả hàng'}</small></td><td>{orderMoney(row.amount)}<small>{Number(row.isPaymentOnlien) === 1 ? 'Thanh toán trực tuyến' : 'COD'}{row.refundMethod === 'MANUAL' ? ' · xác nhận thủ công' : ''}</small></td><td><span className={`operations-status return-${row.status}`}>{RETURN_STATUSES[row.status] || row.status}</span>{row.refundProviderStatus && row.status !== 'REFUNDED' && <small>Cổng thanh toán: {row.refundProviderStatus}</small>}{row.refundedAt && <small>{operationDate(row.refundedAt)}</small>}</td><td><Link to={`/system/home/order-detail/${row.orderId}`}>{row.status === 'REQUESTED' ? 'Duyệt yêu cầu' : row.status === 'SHIPPED' ? 'Kiểm nhận hàng' : row.status === 'REFUND_PENDING' ? 'Xử lý hoàn tiền' : 'Xem chi tiết'}</Link></td></tr>)}
            </tbody></table></div>}
            <nav className="operations-pagination" aria-label="Phân trang trả hàng"><span>{count ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, count)} / ${count}` : '0 yêu cầu'}</span><button type="button" disabled={loading || page === 1} onClick={() => setPage(old => old - 1)}>Trang trước</button><button type="button" disabled={loading || page * 20 >= count} onClick={() => setPage(old => old + 1)}>Trang sau</button></nav>
        </section>
    </main>;
}
