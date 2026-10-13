import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getOperationsReturns } from '../../../services/adminOperationsService';
import { RETURN_STATUSES } from '../../../utils/orders';
import { operationDate, orderMoney, useOperationsFilters, useOperationsQuery } from './operationsShared';
import './Operations.scss';

const initialFilters = { status: 'ALL', keyword: '', from: '', to: '' };
const filterOptions = { status: ['ALL', ...Object.keys(RETURN_STATUSES)] };
export default function OperationsReturns() {
    const { draft, setDraft, filters, page, apply } = useOperationsFilters(initialFilters, filterOptions);
    const params = useMemo(() => ({ ...filters, page, pageSize: 20 }), [filters, page]);
    const { response, loading, error, reload } = useOperationsQuery(getOperationsReturns, params);
    const rows = response?.data || []; const count = Number(response?.count) || 0;
    const change = (name, value) => setDraft(old => ({ ...old, [name]: value }));
    return <main className="admin-operations admin-workspace-page">
        <div className="operations-page-heading"><div><p className="operations-eyebrow">Chăm sóc sau bán</p><h1>Trả hàng và hoàn tiền</h1><p>Theo dõi yêu cầu, hàng thực nhận và khoản hoàn đã xác nhận.</p></div><button type="button" className="btn btn-outline-secondary" disabled={loading} onClick={reload}>Làm mới</button></div>
        <div className="operations-state-tabs" aria-label="Số yêu cầu theo trạng thái">{Object.entries(RETURN_STATUSES).map(([status, label]) => <button key={status} type="button" aria-pressed={filters.status === status} onClick={() => apply({ ...filters, status })}>{label}<strong>{response?.counters?.[status] ?? '—'}</strong></button>)}</div>
        <form className="operations-filter-panel" onSubmit={event => { event.preventDefault(); apply(draft); }}>
            <label className="operations-search">Tìm đơn hoặc khách hàng<input value={draft.keyword} maxLength={100} placeholder="Mã đơn, tên, email hoặc điện thoại" onChange={event => change('keyword', event.target.value)} /></label>
            <label>Trạng thái trả hàng<select value={draft.status} onChange={event => change('status', event.target.value)}><option value="ALL">Tất cả yêu cầu</option>{Object.entries(RETURN_STATUSES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
            <label>Từ ngày yêu cầu<input type="date" value={draft.from} onChange={event => change('from', event.target.value)} /></label><label>Đến ngày yêu cầu<input type="date" value={draft.to} min={draft.from || undefined} onChange={event => change('to', event.target.value)} /></label>
            <button className="btn btn-primary" type="submit">Áp dụng bộ lọc</button><button className="btn btn-outline-secondary" type="button" onClick={() => { setDraft(initialFilters); apply(initialFilters); }}>Xóa bộ lọc</button><small>Ngày yêu cầu tính theo UTC+7. Hoàn tiền đang chờ xác minh được giữ ở trạng thái chờ.</small>
        </form>
        <section className="operations-panel" aria-label="Hàng đợi trả hàng"><div className="operations-table-toolbar"><strong>{count} yêu cầu</strong><span>Trang {page}</span></div>
            <p role="status" className={response ? 'operations-refresh-status' : 'operations-loading'}>{loading ? response ? 'Đang cập nhật yêu cầu trả hàng…' : 'Đang tải yêu cầu trả hàng…' : ''}</p>{error && <div role="alert" className="operations-error"><p>{error}</p><button type="button" onClick={reload}>Thử lại</button></div>}
            {response && <div className="operations-table-scroll" aria-busy={loading}><table className="operations-table"><thead><tr><th>Yêu cầu / đơn</th><th>Khách hàng</th><th>Lý do</th><th>Khoản hoàn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
                {!rows.length && <tr><td colSpan={6} className="operations-empty">Không có yêu cầu phù hợp bộ lọc.</td></tr>}
                {rows.map(row => <tr key={row.id}><td><strong>Yêu cầu #{row.id}</strong><small>Đơn #{row.orderId} · {operationDate(row.requestedAt)}</small></td><td>{row.customerName || '—'}<small>{row.customerPhone || '—'}</small></td><td className="operations-reason">{row.reason}<small>{row.kind === 'UNDELIVERED' ? 'Đơn giao không thành công, đã nhận về kho' : 'Khách yêu cầu trả hàng'}</small></td><td>{orderMoney(row.amount)}<small>{Number(row.isPaymentOnlien) === 1 ? 'Thanh toán trực tuyến' : 'COD'}{String(row.refundMethod).toLowerCase() === 'manual' ? ' · xác nhận thủ công' : ''}</small></td><td><span className={`operations-status return-${row.status}`}>{RETURN_STATUSES[row.status] || row.status}</span>{row.refundProviderStatus && row.status !== 'REFUNDED' && <small>Cổng thanh toán: {row.refundProviderStatus}</small>}{row.refundedAt && <small>{operationDate(row.refundedAt)}</small>}</td><td><Link to={`/system/home/order-detail/${row.orderId}`}>{row.status === 'REQUESTED' ? 'Duyệt yêu cầu' : row.status === 'SHIPPED' ? 'Kiểm nhận hàng' : row.status === 'REFUND_PENDING' ? 'Xử lý hoàn tiền' : 'Xem chi tiết'}</Link></td></tr>)}
            </tbody></table></div>}
            <nav className="operations-pagination" aria-label="Phân trang trả hàng"><span>{count ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, count)} / ${count}` : '0 yêu cầu'}</span><button type="button" disabled={loading || page === 1} onClick={() => apply(filters, page - 1)}>Trang trước</button><button type="button" disabled={loading || page * 20 >= count} onClick={() => apply(filters, page + 1)}>Trang sau</button></nav>
        </section>
    </main>;
}
