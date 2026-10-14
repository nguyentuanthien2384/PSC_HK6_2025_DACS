import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllReceipt } from '../../../services/userService';
import { PAGINATION } from '../../../utils/constant';
import CommonUtils from '../../../utils/CommonUtils';
import usePagedAdminList from '../usePagedAdminList';
import AdminPagination from '../AdminPagination';
import '../StaffTools.scss';

const receiptDate = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
export default function ManageReceipt() {
    const { data, count, total, page, setPage, loading, error, reload } = usePagedAdminList(getAllReceipt, {});
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState('');
    const exportList = async () => {
        if (exporting) return;
        setExporting(true); setExportError('');
        try {
            const response = await getAllReceipt({});
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể xuất phiếu nhập.');
            if (!response.data?.length) throw new Error('Không có phiếu nhập để xuất.');
            await CommonUtils.exportExcel(response.data, 'Danh sách nhập hàng', 'ListReceipt');
        } catch (failure) { setExportError(failure.message || 'Không thể xuất phiếu nhập.'); }
        finally { setExporting(false); }
    };
    return <div className="staff-tools">
        <div className="staff-tools-header"><div><h1>Quản lý nhập hàng</h1><p>Theo dõi phiếu nhập và cập nhật số lượng hàng nhập kho.</p></div><Link to="/system/home/add-receipt" className="btn btn-primary">+ Tạo phiếu nhập</Link></div>
        <section className="staff-tools-panel" aria-label="Danh sách phiếu nhập">
            <div className="staff-tools-toolbar"><p role="status" className="staff-tools-status">{loading ? 'Đang tải phiếu nhập…' : `${total.toLocaleString('vi-VN')} phiếu nhập`}</p><button type="button" className="btn btn-success" disabled={exporting} onClick={exportList}>{exporting ? 'Đang xuất…' : 'Xuất Excel'}</button></div>
            {error && <p role="alert" className="staff-tools-error">{error} <button type="button" className="btn btn-outline-secondary" onClick={reload}>Thử lại</button></p>}
            {exportError && <p role="alert" className="staff-tools-error">{exportError}</p>}
            <div className="table-responsive" aria-busy={loading}><table className="table table-bordered" inert={loading ? true : undefined}><thead><tr><th scope="col">STT</th><th scope="col">Ngày nhập hàng</th><th scope="col">Nhà cung cấp</th><th scope="col">Số điện thoại</th><th scope="col">Nhân viên</th><th scope="col">Thao tác</th></tr></thead><tbody>
                {!loading && !data.length && <tr><td colSpan={6} className="staff-tools-empty">{error ? 'Dữ liệu chưa tải được.' : 'Chưa có phiếu nhập hàng.'}</td></tr>}
                {data.map((row, index) => <tr key={row.id}><td>{page * PAGINATION.pagerow + index + 1}</td><td>{receiptDate(row.createdAt)}</td><td>{row.supplierData?.name || 'Nhà cung cấp không còn tồn tại'}</td><td>{row.supplierData?.phonenumber || '—'}</td><td>{[row.userData?.firstName, row.userData?.lastName].filter(Boolean).join(' ') || 'Tài khoản không còn tồn tại'}</td><td><Link to={`/system/home/detail-receipt/${row.id}`}>Xem chi tiết</Link></td></tr>)}
            </tbody></table></div>
            <AdminPagination pageCount={count} forcePage={page} loading={loading} total={total} pageSize={PAGINATION.pagerow} onPageChange={({ selected }) => setPage(selected)} ariaLabel="Phân trang phiếu nhập" />
        </section>
    </div>;
}
