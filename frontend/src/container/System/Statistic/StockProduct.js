import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactPaginate from 'react-paginate';
import { getStatisticStockProduct } from '../../../services/userService';
import { PAGINATION } from '../../../utils/constant';
import CommonUtils from '../../../utils/CommonUtils';

export default function StockProduct() {
    const [rows, setRows] = useState([]);
    const [count, setCount] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const request = useRef(0);
    const load = useCallback(async (selected = 0) => {
        const current = ++request.current;
        setLoading(true); setError('');
        try {
            const result = await getStatisticStockProduct({ limit: PAGINATION.pagerow, offset: selected * PAGINATION.pagerow });
            if (current !== request.current) return;
            if (!result || result.errCode !== 0) throw new Error(result?.errMessage || 'Không tải được tồn kho.');
            setRows(result.data || []); setCount(result.count || 0); setPage(selected);
        } catch (failure) { if (current === request.current) { setRows([]); setError(failure.message || 'Không tải được tồn kho.'); } }
        finally { if (current === request.current) setLoading(false); }
    }, []);
    useEffect(() => { const requests = request; load(); return () => { requests.current++; }; }, [load]);
    const productName = row => `${row.productdData?.name || 'Sản phẩm đã xóa'} - ${row.productDetaildData?.nameDetail || ''} - ${row.sizeData?.value || ''}`;
    async function exportRows() {
        setExporting(true); setError('');
        try {
            const result = await getStatisticStockProduct({});
            if (!result || result.errCode !== 0) throw new Error(result?.errMessage || 'Không tải được dữ liệu xuất.');
            await CommonUtils.exportExcel(result.data.map(row => ({ 'Mã biến thể': row.id, 'Sản phẩm': productName(row), 'Danh mục': row.productdData?.categoryData?.value || '', 'Thương hiệu': row.productdData?.brandData?.value || '', 'Tồn sau đơn hàng': row.onHand, 'Giữ thanh toán': row.reserved, 'Có thể bán': row.stock })), 'Tồn kho', 'Stock');
        } catch (failure) { setError(failure.message || 'Không xuất được Excel.'); }
        finally { setExporting(false); }
    }
    return <div className="container-fluid px-4">
        <h1 className="mt-4">Quản lý tồn kho</h1>
        <p>Số lượng có thể bán đã trừ hàng trong đơn chưa hủy và hàng đang giữ cho thanh toán online.</p>
        <div className="d-flex gap-2 mb-3"><button type="button" className="btn btn-primary" disabled={loading} onClick={() => load(page)}>Làm mới</button>
            <button type="button" className="btn btn-success" disabled={loading || exporting || !count} onClick={exportRows}>{exporting ? 'Đang xuất…' : 'Xuất Excel'}</button></div>
        {error && <p role="alert" className="text-danger">{error}</p>}{loading && <p role="status">Đang tải tồn kho…</p>}
        {!loading && !error && !rows.length && <p role="status">Chưa có biến thể sản phẩm.</p>}
        <div className="table-responsive"><table className="table table-bordered"><thead><tr><th>STT</th><th>Sản phẩm</th><th>Danh mục</th><th>Thương hiệu</th><th>Tồn sau đơn hàng</th><th>Giữ thanh toán</th><th>Có thể bán</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr key={row.id}><td>{page * PAGINATION.pagerow + index + 1}</td><td>{productName(row)}</td><td>{row.productdData?.categoryData?.value || '—'}</td><td>{row.productdData?.brandData?.value || '—'}</td><td>{row.onHand}</td><td>{row.reserved}</td><td className={row.stock <= 3 ? 'text-danger fw-bold' : ''}>{row.stock}</td></tr>)}</tbody>
        </table></div>
        {count > PAGINATION.pagerow && <ReactPaginate previousLabel="Quay lại" nextLabel="Tiếp" breakLabel="…" pageCount={Math.ceil(count / PAGINATION.pagerow)} forcePage={page} onPageChange={({ selected }) => load(selected)} containerClassName="pagination justify-content-center" pageClassName="page-item" pageLinkClassName="page-link" previousClassName="page-item" previousLinkClassName="page-link" nextClassName="page-item" nextLinkClassName="page-link" activeClassName="active" />}
    </div>;
}
