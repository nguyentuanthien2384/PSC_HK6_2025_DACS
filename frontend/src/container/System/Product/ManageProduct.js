import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminCatalog, updateAdminCatalogStatus } from '../../../services/adminCatalogService';
import CommonUtils from '../../../utils/CommonUtils';
import './ManageProduct.scss';

const initialFilters = { keyword: '', statusId: 'ALL', categoryId: 'ALL', brandId: 'ALL', fromDate: '', toDate: '', sort: 'newest' };
const money = value => value == null ? 'Chưa có giá' : `${Number(value).toLocaleString('vi-VN')} ₫`;
const calendar = value => value ? new Date(value).toLocaleDateString('vi-VN') : '—';
const safeCell = value => typeof value === 'string' && /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
export const catalogExportRows = rows => rows.map(row => ({
    'Mã sản phẩm': row.id, 'Tên sản phẩm': safeCell(row.name), 'Danh mục': safeCell(row.categoryData?.value || ''), 'Thương hiệu': safeCell(row.brandData?.value || ''),
    'Trạng thái': row.statusId === 'S1' ? 'Đang bán' : 'Đã ẩn', 'Giá thấp nhất': row.priceMin ?? '', 'Giá cao nhất': row.priceMax ?? '', 'Số SKU': row.variantCount, 'Lượt xem': row.view || 0, 'Ngày tạo': calendar(row.createdAt),
}));

export default function ManageProduct() {
    const [filters, setFilters] = useState(initialFilters), [search, setSearch] = useState(''), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20);
    const [result, setResult] = useState({ data: [], count: 0, pages: 0, filters: { categories: [], brands: [] } });
    const [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0), [selected, setSelected] = useState([]);
    const [dialog, setDialog] = useState(null), [reason, setReason] = useState(''), [pending, setPending] = useState(false), [notice, setNotice] = useState(''), [failures, setFailures] = useState([]);
    const [exporting, setExporting] = useState(false), [exportProgress, setExportProgress] = useState(0);
    const requestId = useRef(0), alive = useRef(true), exportController = useRef(null), exportingRef = useRef(false), pendingRef = useRef(false);
    useEffect(() => { alive.current = true; return () => { alive.current = false; exportController.current?.abort(); }; }, []);
    useEffect(() => {
        const controller = new AbortController(), id = ++requestId.current;
        exportController.current?.abort();
        setLoading(true); setError(''); setSelected([]); setDialog(null); setResult(previous => ({ ...previous, data: [] }));
        getAdminCatalog({ ...filters, page, pageSize }, controller.signal).then(response => {
            if (id !== requestId.current || controller.signal.aborted) return;
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải danh mục sản phẩm.');
            if (page > Math.max(1, response.pages)) { setPage(Math.max(1, response.pages)); return; }
            setResult(response);
        }).catch(caught => { if (!controller.signal.aborted && id === requestId.current) setError(caught.message || 'Không thể tải danh mục sản phẩm.'); })
            .finally(() => { if (!controller.signal.aborted && id === requestId.current) setLoading(false); });
        return () => controller.abort();
    }, [filters, page, pageSize, reload]);

    const changeFilter = (name, value) => { setFilters(previous => ({ ...previous, [name]: value })); setPage(1); setNotice(''); setFailures([]); };
    const openStatus = (ids, statusId) => { setReason(''); setError(''); setFailures([]); setDialog({ ids, statusId }); };
    const toggle = id => setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
    const submitStatus = async event => {
        event.preventDefault();
        if (pendingRef.current || !dialog || reason.trim().length < 3) return;
        pendingRef.current = true; setPending(true); setError('');
        try {
            const response = await updateAdminCatalogStatus({ ids: dialog.ids, statusId: dialog.statusId, reason: reason.trim() });
            if (!alive.current) return;
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể cập nhật sản phẩm.');
            setNotice(`Đã thay đổi ${response.changed} sản phẩm; ${response.skipped} đã có trạng thái này; ${response.failed} thất bại.`);
            setFailures((response.data || []).filter(row => row.outcome === 'failed'));
            setDialog(null); setReload(previous => previous + 1);
        } catch (caught) { if (alive.current) setError(caught.message || 'Không thể cập nhật sản phẩm.'); }
        finally { pendingRef.current = false; if (alive.current) setPending(false); }
    };
    const exportCatalog = async () => {
        if (exportingRef.current || loading || result.count === 0) return;
        if (result.count > 5000) { setError('Có hơn 5.000 sản phẩm. Vui lòng thu hẹp bộ lọc trước khi xuất Excel.'); return; }
        const id = requestId.current, controller = new AbortController(), rows = [];
        exportController.current = controller; exportingRef.current = true; setExporting(true); setExportProgress(0); setError('');
        try {
            let totalPages = Math.max(1, Math.ceil(result.count / 50));
            for (let current = 1; current <= totalPages; current++) {
                const response = await getAdminCatalog({ ...filters, page: current, pageSize: 50 }, controller.signal);
                if (controller.signal.aborted || requestId.current !== id) return;
                if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể xuất danh mục.');
                if (response.count > 5000) throw new Error('Có hơn 5.000 sản phẩm. Vui lòng thu hẹp bộ lọc trước khi xuất Excel.');
                totalPages = response.pages; rows.push(...response.data); setExportProgress(rows.length);
            }
            if (controller.signal.aborted || requestId.current !== id || !alive.current) return;
            await CommonUtils.exportExcel(catalogExportRows(rows), 'Danh sách sản phẩm', 'DanhSachSanPham');
            if (alive.current && requestId.current === id) setNotice(`Đã xuất ${rows.length} sản phẩm theo bộ lọc hiện tại.`);
        } catch (caught) { if (alive.current && !controller.signal.aborted && requestId.current === id) setError(caught.message || 'Không thể xuất Excel.'); }
        finally { exportingRef.current = false; if (alive.current) setExporting(false); }
    };
    const disabled = pending || exporting;
    return <main className="admin-catalog container-fluid px-4">
        <header className="admin-catalog__header"><div><p className="admin-catalog__eyebrow">DANH MỤC HÀNG HÓA</p><h1>Quản lý sản phẩm</h1><p>Tra cứu sản phẩm, quản lý hiển thị và lưu lịch sử thay đổi.</p></div><Link className="btn btn-primary" to="/system/home/add-product">+ Thêm sản phẩm</Link></header>
        <section className="admin-catalog__filters" aria-label="Bộ lọc sản phẩm">
            <form className="admin-catalog__search" onSubmit={event => { event.preventDefault(); changeFilter('keyword', search.trim()); }}><label htmlFor="catalog-keyword">Tên sản phẩm</label><div><input id="catalog-keyword" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} placeholder="Nhập tên sản phẩm" disabled={disabled} /><button className="btn btn-primary" disabled={disabled}>Tìm kiếm</button></div></form>
            <label>Trạng thái<select value={filters.statusId} disabled={disabled} onChange={event => changeFilter('statusId', event.target.value)}><option value="ALL">Tất cả trạng thái</option><option value="S1">Đang bán</option><option value="S2">Đã ẩn</option></select></label>
            <label>Danh mục<select value={filters.categoryId} disabled={disabled} onChange={event => changeFilter('categoryId', event.target.value)}><option value="ALL">Tất cả danh mục</option>{result.filters?.categories?.map(code => <option key={code.code} value={code.code}>{code.value}</option>)}</select></label>
            <label>Thương hiệu<select value={filters.brandId} disabled={disabled} onChange={event => changeFilter('brandId', event.target.value)}><option value="ALL">Tất cả thương hiệu</option>{result.filters?.brands?.map(code => <option key={code.code} value={code.code}>{code.value}</option>)}</select></label>
            <label>Từ ngày<input type="date" value={filters.fromDate} disabled={disabled} onChange={event => changeFilter('fromDate', event.target.value)} /></label>
            <label>Đến ngày<input type="date" value={filters.toDate} disabled={disabled} onChange={event => changeFilter('toDate', event.target.value)} /></label>
            <label>Sắp xếp<select value={filters.sort} disabled={disabled} onChange={event => changeFilter('sort', event.target.value)}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="nameAsc">Tên A–Z</option><option value="nameDesc">Tên Z–A</option><option value="priceAsc">Giá thấp nhất tăng dần</option><option value="priceDesc">Giá cao nhất giảm dần</option><option value="viewsDesc">Lượt xem nhiều nhất</option></select></label>
            <button className="btn btn-outline-secondary admin-catalog__reset" disabled={disabled} onClick={() => { setFilters(initialFilters); setSearch(''); setPage(1); setNotice(''); setFailures([]); }}>Xóa bộ lọc</button>
        </section>
        {error && <div className="alert alert-danger" role="alert">{error}{!dialog && <button className="btn btn-sm btn-outline-danger ms-3" disabled={disabled} onClick={() => setReload(previous => previous + 1)}>Thử lại</button>}</div>}
        {notice && <p className="alert alert-info" role="status">{notice}</p>}
        {failures.length > 0 && <ul className="alert alert-warning" aria-label="Sản phẩm cập nhật thất bại">{failures.map(row => <li key={row.id}>#{row.id}: {row.errMessage}</li>)}</ul>}
        <section className="admin-catalog__list" aria-label="Danh sách sản phẩm">
            <div className="admin-catalog__toolbar"><div><strong>{loading ? 'Đang tải danh mục…' : `${result.count.toLocaleString('vi-VN')} sản phẩm`}</strong>{selected.length > 0 && <span> · Đã chọn {selected.length}</span>}</div><div className="admin-catalog__actions"><button className="btn btn-outline-secondary" disabled={loading || disabled || !selected.length} onClick={() => openStatus(selected, 'S2')}>Ẩn đã chọn</button><button className="btn btn-outline-primary" disabled={loading || disabled || !selected.length} onClick={() => openStatus(selected, 'S1')}>Hiện đã chọn</button><button className="btn btn-success" disabled={loading || disabled || result.count === 0} onClick={exportCatalog}>{exporting ? `Đang xuất (${exportProgress})…` : 'Xuất Excel theo bộ lọc'}</button></div></div>
            <div className="table-responsive"><table className="table align-middle"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả trên trang" disabled={loading || disabled || !result.data.length} checked={result.data.length > 0 && selected.length === result.data.length} onChange={event => setSelected(event.target.checked ? result.data.map(row => row.id) : [])} /></th><th>Sản phẩm</th><th>Danh mục / thương hiệu</th><th>Khoảng giá</th><th>SKU</th><th>Lượt xem</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead><tbody>
                {loading ? <tr><td colSpan={9} className="admin-catalog__empty" role="status">Đang tải sản phẩm…</td></tr> : result.data.length === 0 ? <tr><td colSpan={9} className="admin-catalog__empty">{error ? 'Dữ liệu chưa tải được.' : 'Không có sản phẩm phù hợp với bộ lọc.'}</td></tr> : result.data.map(row => <tr key={row.id}><td><input type="checkbox" aria-label={`Chọn sản phẩm ${row.id}`} disabled={disabled} checked={selected.includes(row.id)} onChange={() => toggle(row.id)} /></td><td><div className="admin-catalog__product">{row.image ? <img src={row.image} alt="" width={48} height={48} loading="lazy" decoding="async" /> : <span className="admin-catalog__no-image" aria-hidden="true">—</span>}<div><Link to={`/system/home/list-product-detail/${row.id}`}>{row.name}</Link><small>#{row.id}</small></div></div></td><td>{row.categoryData?.value || 'Chưa phân loại'}<small>{row.brandData?.value || 'Chưa có thương hiệu'}</small></td><td>{money(row.priceMin)}{row.priceMax != null && row.priceMax !== row.priceMin && <small>đến {money(row.priceMax)}</small>}</td><td>{row.variantCount}</td><td>{Number(row.view || 0).toLocaleString('vi-VN')}</td><td><span className={`admin-catalog__badge ${row.statusId === 'S1' ? 'is-active' : 'is-hidden'}`}>{row.statusId === 'S1' ? 'Đang bán' : 'Đã ẩn'}</span></td><td>{calendar(row.createdAt)}</td><td><div className="admin-catalog__row-actions"><Link to={`/system/home/edit-product/${row.id}`}>Chỉnh sửa</Link><button type="button" disabled={disabled} onClick={() => openStatus([row.id], row.statusId === 'S1' ? 'S2' : 'S1')}>{row.statusId === 'S1' ? 'Ẩn sản phẩm' : 'Hiện sản phẩm'}</button></div></td></tr>)}
            </tbody></table></div>
            <footer className="admin-catalog__pagination"><label>Số dòng mỗi trang<select value={pageSize} disabled={disabled} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label><span>Trang {page} / {Math.max(1, result.pages)}</span><div><button className="btn btn-outline-secondary" disabled={loading || disabled || page === 1} onClick={() => setPage(previous => previous - 1)}>Trang trước</button><button className="btn btn-outline-secondary" disabled={loading || disabled || page >= result.pages} onClick={() => setPage(previous => previous + 1)}>Trang sau</button></div></footer>
        </section>
        {dialog && <div className="admin-catalog__modal"><section role="dialog" aria-modal="true" aria-labelledby="catalog-status-title"><h2 id="catalog-status-title">{dialog.statusId === 'S2' ? 'Ẩn' : 'Hiện'} {dialog.ids.length} sản phẩm</h2><p>{dialog.statusId === 'S2' ? 'Sản phẩm sẽ ngừng hiển thị trên cửa hàng. Dữ liệu và lịch sử đơn hàng được giữ lại.' : 'Sản phẩm sẽ hiển thị trở lại trên cửa hàng.'}</p><form onSubmit={submitStatus}><label htmlFor="catalog-status-reason">Lý do thay đổi</label><textarea id="catalog-status-reason" autoFocus value={reason} disabled={pending} minLength={3} maxLength={500} onChange={event => setReason(event.target.value)} placeholder="Nhập lý do để lưu vào lịch sử quản trị" /><small>{reason.trim().length}/500 ký tự · tối thiểu 3 ký tự</small><div><button type="button" className="btn btn-outline-secondary" disabled={pending} onClick={() => setDialog(null)}>Hủy</button><button className="btn btn-primary" disabled={pending || reason.trim().length < 3}>{pending ? 'Đang cập nhật…' : 'Xác nhận thay đổi'}</button></div></form></section></div>}
    </main>;
}
