import React, { useCallback, useEffect, useRef, useState } from 'react';
import AdminPagination from '../AdminPagination';
import { getStatisticStockProduct } from '../../../services/userService';
import { PAGINATION } from '../../../utils/constant';
import CommonUtils from '../../../utils/CommonUtils';
import './StockProduct.scss';

export default function StockProduct() {
    const [rows, setRows] = useState([]);
    const [count, setCount] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const [exportError, setExportError] = useState('');
    const request = useRef(0);
    const controller = useRef(null);
    const load = useCallback(async (selected = 0) => {
        const current = ++request.current;
        controller.current?.abort();
        const active = new AbortController();
        controller.current = active;
        setLoading(true); setError('');
        try {
            let target = selected;
            while (!active.signal.aborted) {
                const result = await getStatisticStockProduct({ limit: PAGINATION.pagerow, offset: target * PAGINATION.pagerow, signal: active.signal });
                if (current !== request.current || active.signal.aborted) return;
                if (!result || result.errCode !== 0) throw new Error(result?.errMessage || 'Không tải được tồn kho.');
                const total = Math.max(0, Number(result.count) || 0);
                const lastPage = Math.max(0, Math.ceil(total / PAGINATION.pagerow) - 1);
                if (target > lastPage) { target = lastPage; continue; }
                setRows(result.data || []); setCount(total); setPage(target);
                break;
            }
        } catch (failure) { if (current === request.current && !active.signal.aborted) setError(failure.message || 'Không tải được tồn kho.'); }
        finally { if (current === request.current && !active.signal.aborted) setLoading(false); }
    }, []);
    useEffect(() => { const requests = request; const pending = controller; load(); return () => { requests.current++; pending.current?.abort(); }; }, [load]);
    const productName = row => `${row.productdData?.name || 'Sản phẩm đã xóa'} - ${row.productDetaildData?.nameDetail || ''} - ${row.sizeData?.value || ''}`;
    async function exportRows() {
        setExporting(true); setExportError('');
        try {
            const result = await getStatisticStockProduct({});
            if (!result || result.errCode !== 0) throw new Error(result?.errMessage || 'Không tải được dữ liệu xuất.');
            await CommonUtils.exportExcel(result.data.map(row => ({ 'Mã biến thể': row.id, 'Sản phẩm': productName(row), 'Danh mục': row.productdData?.categoryData?.value || '', 'Thương hiệu': row.productdData?.brandData?.value || '', 'Tồn sau đơn hàng': row.onHand, 'Giữ thanh toán': row.reserved, 'Có thể bán': row.stock })), 'Tồn kho', 'Stock');
        } catch (failure) { setExportError(failure.message || 'Không xuất được Excel.'); }
        finally { setExporting(false); }
    }
    return <div className="container-fluid px-4 admin-stock">
        <h1>Quản lý tồn kho</h1>
        <p className="admin-stock__description">Số lượng có thể bán đã trừ hàng trong đơn chưa hủy và hàng đang giữ cho thanh toán online.</p>
        <div className="admin-stock__actions"><button type="button" className="btn btn-primary" disabled={loading} onClick={() => load(page)}>Làm mới</button>
            <button type="button" className="btn btn-success" disabled={loading || exporting || !count} onClick={exportRows}>{exporting ? 'Đang xuất…' : 'Xuất Excel'}</button></div>
        <p role="status" className="admin-stock__status">{loading ? rows.length ? 'Đang cập nhật tồn kho…' : 'Đang tải tồn kho…' : ''}</p>
        {error && <p role="alert" className="text-danger">{error}{rows.length > 0 && ' Dữ liệu bên dưới chưa được cập nhật.'}</p>}
        {exportError && <p role="alert" className="text-danger">{exportError}</p>}
        <section className="admin-stock__list" aria-label="Danh sách tồn kho" aria-busy={loading}>
        <div className="table-responsive" tabIndex={0} aria-label="Bảng tồn kho, có thể cuộn ngang"><table className="table table-bordered"><caption className="visually-hidden">Số lượng tồn kho theo từng biến thể sản phẩm</caption><thead><tr><th scope="col">STT</th><th scope="col">Sản phẩm</th><th scope="col">Danh mục</th><th scope="col">Thương hiệu</th><th scope="col">Tồn sau đơn hàng</th><th scope="col">Giữ thanh toán</th><th scope="col">Có thể bán</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr key={row.id}><td>{page * PAGINATION.pagerow + index + 1}</td><td>{productName(row)}</td><td>{row.productdData?.categoryData?.value || '—'}</td><td>{row.productdData?.brandData?.value || '—'}</td><td>{row.onHand}</td><td>{row.reserved}</td><td className={row.stock <= 3 ? 'text-danger fw-bold' : ''}>{row.stock}</td></tr>)}</tbody>
        </table></div>
        {!loading && !error && !rows.length && <p role="status" className="admin-stock__empty">Chưa có biến thể sản phẩm.</p>}
        <AdminPagination ariaLabel="Phân trang tồn kho" pageCount={Math.ceil(count / PAGINATION.pagerow)} forcePage={page} total={count} pageSize={PAGINATION.pagerow} loading={loading} onPageChange={({ selected }) => load(selected)} />
        </section>
    </div>;
}
