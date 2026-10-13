import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOperationsOrders, bulkOperationsOrders } from '../../../services/adminOperationsService';
import { getActiveShippers } from '../../../services/shippingService';
import { ORDER_STATUSES, shipperName } from '../../../utils/orders';
import { operationDate, orderMoney, useOperationsQuery } from './operationsShared';
import './Operations.scss';

const initialFilters = { keyword: '', status: 'ALL', payment: 'ALL', carrier: 'ALL', from: '', to: '' };
export default function OperationsOrders() {
    const [draft, setDraft] = useState(initialFilters); const [filters, setFilters] = useState(initialFilters);
    const [page, setPage] = useState(1); const [selected, setSelected] = useState([]); const [action, setAction] = useState('CONFIRM');
    const [confirming, setConfirming] = useState(false); const [busy, setBusy] = useState(false); const [results, setResults] = useState(null);
    const [actionError, setActionError] = useState(''); const [shippers, setShippers] = useState([]); const [shipperId, setShipperId] = useState('');
    const [shipperState, setShipperState] = useState({ loading: false, error: '' }); const [shipperRevision, setShipperRevision] = useState(0);
    const mounted = useRef(true); const submitting = useRef(false);
    const params = useMemo(() => ({ ...filters, page, pageSize: 20 }), [filters, page]);
    const { response, loading, error, reload } = useOperationsQuery(getOperationsOrders, params);
    const rows = response?.data || []; const count = Number(response?.count) || 0;
    const eligible = rows.filter(row => action === 'CONFIRM' ? row.actions?.confirm : row.actions?.assign);
    const changeFilter = (name, value) => setDraft(old => ({ ...old, [name]: value }));
    const clearSelection = () => { setSelected([]); setConfirming(false); setResults(null); setActionError(''); };
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        if (action !== 'ASSIGN') return undefined;
        let active = true; setShipperState({ loading: true, error: '' });
        getActiveShippers().then(result => {
            if (!active) return;
            if (result?.errCode !== 0) throw new Error(result?.errMessage || 'Không thể tải người giao hàng.');
            setShippers(result.data || []); setShipperState({ loading: false, error: '' });
        }).catch(failure => { if (active) setShipperState({ loading: false, error: failure.message }); });
        return () => { active = false; };
    }, [action, shipperRevision]);
    const execute = async () => {
        if (submitting.current || !selected.length || (action === 'ASSIGN' && !shipperId)) return;
        submitting.current = true; setBusy(true); setActionError('');
        try {
            const result = await bulkOperationsOrders({ action, orderIds: selected, ...(action === 'ASSIGN' ? { shipperId: Number(shipperId) } : {}) });
            if (!mounted.current) return;
            if (result?.errCode !== 0) throw new Error(result?.errMessage || 'Không thể cập nhật đơn hàng.');
            setResults(result); setSelected([]); setConfirming(false); reload();
        } catch (failure) { if (mounted.current) setActionError(failure.message); }
        finally { submitting.current = false; if (mounted.current) setBusy(false); }
    };
    const exportPage = async () => {
        try {
            const { default: CommonUtils } = await import('../../../utils/CommonUtils');
            await CommonUtils.exportExcel(rows.map(row => ({ 'Mã đơn': row.id, 'Người nhận': row.customerName || '', 'Điện thoại': row.customerPhone || '', 'Ngày đặt (UTC+7)': operationDate(row.createdAt), 'Trạng thái': ORDER_STATUSES[row.statusId] || row.statusId, 'Tổng tiền': row.totalPrice, 'Thanh toán': Number(row.isPaymentOnlien) === 1 ? 'Trực tuyến' : 'COD', 'Vận chuyển': row.deliveryProvider, 'Mã vận đơn': row.trackingCode || '' })), 'Đơn hàng trang hiện tại', 'Orders');
        } catch (failure) { if (mounted.current) setActionError(failure.message); }
    };
    return <main className="admin-operations admin-workspace-page">
        <div className="operations-page-heading"><div><p className="operations-eyebrow">Vận hành bán hàng</p><h1>Trung tâm đơn hàng</h1><p>Lọc, kiểm tra và xử lý đơn theo trạng thái thực tế.</p></div><button type="button" className="btn btn-outline-secondary" onClick={() => { clearSelection(); reload(); }} disabled={loading || busy}>Làm mới</button></div>
        <div className="operations-state-tabs" aria-label="Số đơn theo trạng thái">
            {Object.entries(ORDER_STATUSES).map(([code, label]) => <button type="button" key={code} aria-pressed={filters.status === code} disabled={busy} onClick={() => { clearSelection(); setPage(1); setFilters(old => ({ ...old, status: code })); setDraft(old => ({ ...old, status: code })); }}>{label}<strong>{response?.counters?.[code] ?? '—'}</strong></button>)}
        </div>
        <form className="operations-filter-panel" onSubmit={event => { event.preventDefault(); clearSelection(); setPage(1); setFilters({ ...draft }); }}>
            <label className="operations-search">Tìm đơn hoặc khách hàng<input value={draft.keyword} maxLength={100} disabled={busy} placeholder="Mã đơn, tên, email hoặc điện thoại" onChange={event => changeFilter('keyword', event.target.value)} /></label>
            <label>Trạng thái<select value={draft.status} disabled={busy} onChange={event => changeFilter('status', event.target.value)}><option value="ALL">Tất cả trạng thái</option>{Object.entries(ORDER_STATUSES).map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></label>
            <label>Thanh toán<select value={draft.payment} disabled={busy} onChange={event => changeFilter('payment', event.target.value)}><option value="ALL">Tất cả hình thức</option><option value="COD">COD</option><option value="ONLINE">Trực tuyến</option></select></label>
            <label>Vận chuyển<select value={draft.carrier} disabled={busy} onChange={event => changeFilter('carrier', event.target.value)}><option value="ALL">Tất cả đơn vị</option><option value="internal">Shipper cửa hàng</option><option value="ghn">GHN</option><option value="ghtk">GHTK</option></select></label>
            <label>Từ ngày đặt<input type="date" value={draft.from} disabled={busy} onChange={event => changeFilter('from', event.target.value)} /></label>
            <label>Đến ngày đặt<input type="date" value={draft.to} min={draft.from || undefined} disabled={busy} onChange={event => changeFilter('to', event.target.value)} /></label>
            <button type="submit" className="btn btn-primary" disabled={busy}>Áp dụng bộ lọc</button><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => { clearSelection(); setDraft(initialFilters); setFilters(initialFilters); setPage(1); }}>Xóa bộ lọc</button>
            <small>Ngày đặt được tính theo giờ Việt Nam (UTC+7). Số trên các trạng thái áp dụng cùng bộ lọc.</small>
        </form>
        <section className="operations-panel" aria-label="Danh sách đơn hàng">
            <div className="operations-table-toolbar"><div><strong>{count} đơn hàng</strong><span> · Trang {page}</span></div><button type="button" className="btn btn-outline-secondary" disabled={loading || busy || !rows.length || !!error} onClick={exportPage}>Xuất trang đang xem</button></div>
            <div className="operations-bulk-toolbar"><label>Thao tác nhiều đơn<select value={action} disabled={busy} onChange={event => { clearSelection(); setAction(event.target.value); setShipperId(''); }}><option value="CONFIRM">Xác nhận đơn</option><option value="ASSIGN">Phân công shipper cửa hàng</option></select></label>
                {action === 'ASSIGN' && <label>Người giao hàng<select value={shipperId} disabled={busy || shipperState.loading || !!shipperState.error} onChange={event => setShipperId(event.target.value)}><option value="">Chọn người giao hàng</option>{shippers.map(shipper => <option key={shipper.id} value={shipper.id}>{shipperName(shipper)}</option>)}</select></label>}
                <button type="button" className="btn btn-primary" disabled={busy || loading || !selected.length || (action === 'ASSIGN' && (!shipperId || shipperState.loading || !!shipperState.error))} onClick={() => setConfirming(true)}>Xử lý {selected.length} đơn đã chọn</button>
            </div>
            {shipperState.error && action === 'ASSIGN' && <p role="alert">{shipperState.error} <button type="button" disabled={busy} onClick={() => setShipperRevision(value => value + 1)}>Tải lại shipper</button></p>}
            {actionError && <p role="alert" className="operations-error">{actionError}</p>}
            {confirming && <div className="operations-confirm" role="region" aria-label="Kiểm tra thao tác"><strong>{action === 'CONFIRM' ? 'Xác nhận' : 'Phân công giao'} {selected.length} đơn: {selected.map(id => `#${id}`).join(', ')}</strong><p>Mỗi đơn được kiểm tra lại khi xử lý. Đơn đã đổi trạng thái hoặc không đủ điều kiện sẽ được báo riêng.</p><button type="button" className="btn btn-primary" disabled={busy} onClick={execute}>{busy ? 'Đang xử lý…' : 'Xác nhận thao tác'}</button><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setConfirming(false)}>Quay lại</button></div>}
            {results && <div role="status" className="operations-result"><strong>Thành công {results.succeeded}, chưa xử lý {results.failed}.</strong>{results.results?.map(row => <p key={row.orderId}>#{row.orderId}: {row.errMessage}</p>)}</div>}
            {loading && <p role="status" className="operations-loading">Đang tải đơn hàng…</p>}
            {error && <div role="alert" className="operations-error"><p>{error}</p><button type="button" onClick={reload}>Thử lại</button></div>}
            {!loading && !error && <div className="operations-table-scroll"><table className="operations-table"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả đơn đủ điều kiện trên trang" disabled={busy || !eligible.length} checked={!!eligible.length && eligible.every(row => selected.includes(row.id))} onChange={event => setSelected(event.target.checked ? eligible.map(row => row.id) : [])} /></th><th>Đơn hàng</th><th>Người nhận</th><th>Tổng tiền</th><th>Trạng thái</th><th>Vận chuyển</th><th>Thao tác</th></tr></thead><tbody>
                {!rows.length && <tr><td colSpan={7} className="operations-empty">Không có đơn phù hợp. Thử thay đổi bộ lọc.</td></tr>}
                {rows.map(row => <tr key={row.id}><td><input type="checkbox" aria-label={`Chọn đơn ${row.id}`} checked={selected.includes(row.id)} disabled={busy || !(action === 'CONFIRM' ? row.actions?.confirm : row.actions?.assign)} onChange={event => setSelected(old => event.target.checked ? [...old, row.id] : old.filter(id => id !== row.id))} /></td><td><Link to={`/system/home/order-detail/${row.id}`}><strong>#{row.id}</strong></Link><small>{operationDate(row.createdAt)}</small></td><td>{row.customerName || 'Không còn thông tin người nhận'}<small>{row.customerPhone || row.customerEmail || '—'}</small></td><td>{orderMoney(row.totalPrice)}<small>{Number(row.isPaymentOnlien) === 1 ? `Trực tuyến${row.paymentProvider ? ` · ${row.paymentProvider.toUpperCase()}` : ''}` : 'COD'}</small></td><td><span className={`operations-status status-${row.statusId}`}>{ORDER_STATUSES[row.statusId] || row.statusId}</span></td><td>{row.deliveryProvider === 'internal' ? 'Shipper cửa hàng' : row.deliveryProvider?.toUpperCase()}<small>{row.trackingCode || (row.shipperId ? `Shipper #${row.shipperId}` : 'Chưa phân công')}</small></td><td><Link to={`/system/home/order-detail/${row.id}`}>Chi tiết</Link></td></tr>)}
            </tbody></table></div>}
            <nav className="operations-pagination" aria-label="Phân trang đơn hàng"><span>{count ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, count)} / ${count}` : '0 đơn'}</span><button type="button" disabled={busy || loading || page === 1} onClick={() => { clearSelection(); setPage(old => old - 1); }}>Trang trước</button><button type="button" disabled={busy || loading || page * 20 >= count} onClick={() => { clearSelection(); setPage(old => old + 1); }}>Trang sau</button></nav>
        </section>
    </main>;
}
