import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { countInventory, getAdminInventory, getInventoryHistory } from '../../../services/adminInventoryService';
import { formatOrderDate } from '../../../utils/orders';
import './InventoryManagement.scss';

const pageSize = 25;
const requestKey = () => window.crypto?.randomUUID?.() || `count_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const checked = response => {
    if (response?.errCode !== 0) {
        const error = new Error(response?.errMessage || 'Không thể tải tồn kho.');
        error.current = response?.current;
        throw error;
    }
    return response;
};
const inventoryFilters = params => ({
    search: (params.get('keyword') || params.get('search') || '').trim().slice(0, 150),
    categoryId: (params.get('categoryId') || '').slice(0, 50),
    statusId: ['S1', 'S2'].includes(params.get('statusId')) ? params.get('statusId') : '',
    stock: ['low', 'out'].includes(params.get('stock')) ? params.get('stock') : 'all'
});

export default function InventoryManagement() {
    const [searchParams, setSearchParams] = useSearchParams();
    const urlFilters = searchParams.toString();
    const [search, setSearch] = useState(() => inventoryFilters(searchParams).search);
    const [filters, setFilters] = useState(() => inventoryFilters(searchParams));
    const [page, setPage] = useState(0);
    const [rows, setRows] = useState([]);
    const [categories, setCategories] = useState([]);
    const [summary, setSummary] = useState({});
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [selected, setSelected] = useState(null);
    const [target, setTarget] = useState('');
    const [reason, setReason] = useState('');
    const [key, setKey] = useState('');
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');
    const [history, setHistory] = useState(null);
    const [historyRows, setHistoryRows] = useState([]);
    const [historyCount, setHistoryCount] = useState(0);
    const [historyPage, setHistoryPage] = useState(0);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const sequence = useRef(0), historySequence = useRef(0), pending = useRef(false), mounted = useRef(true);
    const listController = useRef(null), historyController = useRef(null);
    const invalidateList = useCallback(() => { sequence.current += 1; listController.current?.abort(); }, []);
    const invalidateHistory = useCallback(() => { historySequence.current += 1; historyController.current?.abort(); }, []);
    const unmount = useCallback(() => { mounted.current = false; invalidateList(); invalidateHistory(); }, [invalidateList, invalidateHistory]);
    useEffect(() => { mounted.current = true; return unmount; }, [unmount]);
    useEffect(() => {
        const next = inventoryFilters(new URLSearchParams(urlFilters));
        setSearch(next.search);
        setFilters(previous => Object.keys(next).every(key => next[key] === previous[key]) ? previous : next);
        setPage(0);
    }, [urlFilters]);
    const load = useCallback(async () => {
        listController.current?.abort();
        const controller = new AbortController();
        listController.current = controller;
        const ticket = ++sequence.current;
        setLoading(true); setError('');
        try {
            const response = checked(await getAdminInventory({ ...filters, limit: pageSize, offset: page * pageSize }, controller.signal));
            if (controller.signal.aborted || ticket !== sequence.current || !mounted.current) return;
            setRows(response.data || []); setTotal(Number(response.count) || 0); setCategories(response.categories || []); setSummary(response.summary || {});
        } catch (failure) { if (!controller.signal.aborted && ticket === sequence.current && mounted.current) setError(failure.message); }
        finally { if (!controller.signal.aborted && ticket === sequence.current && mounted.current) setLoading(false); }
    }, [filters, page]);
    useEffect(() => { load(); return invalidateList; }, [load, invalidateList]);
    useEffect(() => {
        if (!history) return undefined;
        const controller = new AbortController();
        historyController.current = controller;
        const ticket = ++historySequence.current;
        setHistoryLoading(true); setHistoryError('');
        getInventoryHistory(history.variantId, { limit: pageSize, offset: historyPage * pageSize }, controller.signal).then(checked).then(response => {
            if (!controller.signal.aborted && ticket === historySequence.current && mounted.current) { setHistoryRows(response.data || []); setHistoryCount(Number(response.count) || 0); }
        }).catch(failure => { if (!controller.signal.aborted && ticket === historySequence.current && mounted.current) setHistoryError(failure.message); })
            .finally(() => { if (!controller.signal.aborted && ticket === historySequence.current && mounted.current) setHistoryLoading(false); });
        return invalidateHistory;
    }, [history, historyPage, invalidateHistory]);
    const filter = (field, value) => {
        const next = { ...filters, [field]: value }, params = new URLSearchParams();
        Object.entries(next).forEach(([key, item]) => { if (item && item !== 'all') params.set(key === 'search' ? 'keyword' : key, item); });
        setSearchParams(params); setFilters(next); setPage(0);
    };
    const openCount = row => {
        setSelected({ ...row }); setTarget(String(Math.max(0, row.onHand))); setReason(''); setKey(requestKey()); setActionError(''); setNotice('');
    };
    const validTarget = /^\d+$/.test(target) && Number.isSafeInteger(Number(target)) && Number(target) <= 2147483647;
    const canSave = selected && validTarget && Number(target) >= selected.reserved && Number(target) !== selected.onHand && reason.trim().length >= 3 && reason.trim().length <= 1000;
    const save = async event => {
        event.preventDefault();
        if (!canSave || pending.current) return;
        pending.current = true; setBusy(true); setActionError('');
        try {
            const response = checked(await countInventory({ variantId: selected.variantId, targetOnHand: Number(target), expectedOnHand: selected.onHand, reason: reason.trim(), idempotencyKey: key }));
            if (!mounted.current) return;
            setSelected(null); setNotice(response.errMessage || 'Đã ghi nhận kiểm kê.');
            if (history?.variantId === selected.variantId) { setHistory({ ...history }); setHistoryPage(0); }
            await load();
        } catch (failure) {
            if (mounted.current) {
                const current = failure.current;
                if (current && Number.isSafeInteger(current.onHand) && Number.isSafeInteger(current.reserved) && current.reserved >= 0) {
                    // A rejected stale count has not committed. Refresh its
                    // snapshot and request key, keeping the proposed target for
                    // the operator to review and explicitly confirm again.
                    setSelected(previous => previous ? { ...previous, onHand: current.onHand, reserved: current.reserved,
                        available: Math.max(0, current.onHand - current.reserved) } : previous);
                    setKey(requestKey());
                    setActionError(`${failure.message} Phiếu đã cập nhật tồn mới; hãy kiểm tra số lượng và xác nhận lại.`);
                    await load();
                } else setActionError(failure.message);
            }
        }
        finally { pending.current = false; if (mounted.current) setBusy(false); }
    };
    return <div className="container-fluid inventory-management">
        <div className="inventory-heading"><div><h1 className="h3">Tồn kho và kiểm kê</h1><p>Theo dõi từng màu/kích cỡ, hàng giữ cho thanh toán và lịch sử kiểm kê.</p></div><button className="btn btn-outline-success" type="button" disabled={busy || loading} onClick={load}>Làm mới tồn kho</button></div>
        <div className="inventory-metrics">{[['variants', 'Biến thể'], ['available', 'Có thể bán'], ['reserved', 'Giữ thanh toán'], ['low', 'Sắp hết (1–5)'], ['out', 'Hết hàng']].map(([name, label]) => <div key={name}><span>{label}</span><strong>{summary[name] ?? '—'}</strong></div>)}</div>
        <form className="inventory-filters" onSubmit={event => { event.preventDefault(); filter('search', search.trim()); }}>
            <label>Tìm sản phẩm / SKU<input className="form-control" value={search} maxLength={150} onChange={event => setSearch(event.target.value)} placeholder="Tên, màu, SKU-123 hoặc mã biến thể" /></label>
            <label>Danh mục<select className="form-control" value={filters.categoryId} onChange={event => filter('categoryId', event.target.value)}><option value="">Tất cả danh mục</option>{categories.map(category => <option key={category.code} value={category.code}>{category.value}</option>)}</select></label>
            <label>Tình trạng tồn<select className="form-control" value={filters.stock} onChange={event => filter('stock', event.target.value)}><option value="all">Tất cả tồn kho</option><option value="low">Sắp hết (1–5)</option><option value="out">Hết hàng</option></select></label>
            <label>Kinh doanh<select className="form-control" value={filters.statusId} onChange={event => filter('statusId', event.target.value)}><option value="">Tất cả sản phẩm</option><option value="S1">Đang kinh doanh</option><option value="S2">Ngừng kinh doanh</option></select></label>
            <button className="btn btn-success" type="submit">Tìm kiếm</button>
        </form>
        {notice && <p role="status" className="alert alert-success">{notice}</p>}
        <p className="inventory-loading" role="status">{loading ? 'Đang tải tồn kho…' : ''}</p>
        {error && <div role="alert" className="alert alert-danger">{error} <button type="button" className="btn btn-sm btn-outline-danger" onClick={load}>Thử lại</button></div>}
        {!error && (!loading || rows.length > 0) && <><div className="inventory-table-wrap" aria-busy={loading}><table className="table inventory-table"><thead><tr><th>Sản phẩm / biến thể</th><th>Tồn sổ sách</th><th>Giữ thanh toán</th><th>Có thể bán</th><th>Thao tác</th></tr></thead><tbody>{rows.map(row => <tr key={row.variantId}><td><strong>{row.productName}</strong><small>{row.variantName} · {row.size} · {row.sku}</small><small>{row.categoryName} · {row.statusId === 'S1' ? 'Đang kinh doanh' : 'Ngừng kinh doanh'}</small></td><td>{row.onHand}</td><td>{row.reserved}</td><td><span className={`inventory-stock ${row.available <= 0 ? 'empty' : row.available <= 5 ? 'low' : ''}`}>{row.available}</span></td><td><div className="inventory-actions"><button type="button" className="btn btn-sm btn-success" disabled={busy || loading} aria-label={`Kiểm kê ${row.sku}`} onClick={() => openCount(row)}>Kiểm kê</button><button type="button" className="btn btn-sm btn-outline-secondary" disabled={loading} aria-label={`Lịch sử ${row.sku}`} onClick={() => { setHistory({ ...row }); setHistoryPage(0); }}>Lịch sử</button></div></td></tr>)}</tbody></table></div>{!rows.length && <p>Không tìm thấy biến thể theo bộ lọc.</p>}<nav className="inventory-pagination" aria-label="Phân trang tồn kho"><span>{total} biến thể · Trang {page + 1}/{Math.max(1, Math.ceil(total / pageSize))}</span><button type="button" className="btn btn-sm btn-outline-secondary" disabled={page === 0 || busy || loading} onClick={() => setPage(page - 1)}>Trang trước</button><button type="button" className="btn btn-sm btn-outline-secondary" disabled={(page + 1) * pageSize >= total || busy || loading} onClick={() => setPage(page + 1)}>Trang sau</button></nav></>}
        <p className="inventory-help">Tồn sổ sách đã trừ hàng phân bổ cho đơn chưa hủy. Hàng đang chờ thanh toán vẫn nằm trong tồn sổ sách; có thể bán = tồn sổ sách − giữ thanh toán. Đối chiếu hàng chưa phân bổ khi kiểm kê.</p>
        {selected && <section className="inventory-panel" aria-label="Phiếu kiểm kê"><div className="inventory-heading"><h2 className="h5">Kiểm kê {selected.sku} · {selected.productName}</h2><button className="btn btn-sm btn-outline-secondary" type="button" disabled={busy} onClick={() => setSelected(null)}>Đóng kiểm kê</button></div><p>Tồn khi mở phiếu: <strong>{selected.onHand}</strong> · Đang giữ thanh toán: <strong>{selected.reserved}</strong>. Phiếu chỉ lưu khi tồn chưa thay đổi.</p><form onSubmit={save}><label>Tồn sau kiểm kê<input className="form-control" type="number" min={selected.reserved} max="2147483647" step="1" value={target} disabled={busy} onChange={event => setTarget(event.target.value)} /></label>{validTarget && <p>Điều chỉnh: <strong>{Number(target) - selected.onHand > 0 ? '+' : ''}{Number(target) - selected.onHand}</strong> · Có thể bán sau kiểm kê: {Math.max(0, Number(target) - selected.reserved)}</p>}{validTarget && Number(target) < selected.reserved && <p role="alert">Không thể giảm tồn xuống dưới {selected.reserved} sản phẩm đang giữ cho thanh toán.</p>}<label>Lý do kiểm kê<textarea className="form-control" value={reason} maxLength={1000} disabled={busy} rows={3} placeholder="Ví dụ: kiểm kê cuối ngày, thất thoát hoặc hàng hỏng" onChange={event => setReason(event.target.value)} /></label>{actionError && <p role="alert" className="text-danger">{actionError}</p>}<button className="btn btn-success" type="submit" disabled={busy || !canSave}>{busy ? 'Đang lưu kiểm kê…' : 'Xác nhận kiểm kê'}</button></form></section>}
        {history && <section className="inventory-panel" aria-label="Lịch sử kiểm kê"><div className="inventory-heading"><h2 className="h5">Lịch sử {history.sku} · {history.productName}</h2><button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setHistory(null)}>Đóng lịch sử</button></div>{historyLoading && <p role="status">Đang tải lịch sử…</p>}{historyError && <p role="alert" className="text-danger">{historyError}</p>}{!historyLoading && !historyError && <>{!historyRows.length && <p>Chưa có lần kiểm kê. Nhập hàng và hoàn kho được giữ trong chứng từ gốc.</p>}{historyRows.map(item => <article className="inventory-history" key={item.id}><strong>{item.quantity > 0 ? '+' : ''}{item.quantity} · {item.onHandBefore} → {item.onHandAfter}</strong><p>{item.reason}</p><small>{item.actorName} · {formatOrderDate(item.createdAt)} · Giữ thanh toán khi kiểm kê: {item.reservedAtCount}</small></article>)}<nav className="inventory-pagination" aria-label="Phân trang lịch sử"><span>{historyCount} lần kiểm kê</span><button className="btn btn-sm btn-outline-secondary" type="button" disabled={historyPage === 0} onClick={() => setHistoryPage(historyPage - 1)}>Lịch sử trước</button><button className="btn btn-sm btn-outline-secondary" type="button" disabled={(historyPage + 1) * pageSize >= historyCount} onClick={() => setHistoryPage(historyPage + 1)}>Lịch sử sau</button></nav></>}</section>}
    </div>;
}
