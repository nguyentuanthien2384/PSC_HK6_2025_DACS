import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { deleteSupplierService, getAllSupplier } from '../../../services/userService';
import { PAGINATION } from '../../../utils/constant';
import FormSearch from '../../../component/Search/FormSearch';
import CommonUtils from '../../../utils/CommonUtils';
import usePagedAdminList from '../usePagedAdminList';
import AdminPagination from '../AdminPagination';
import '../StaffTools.scss';

export default function ManageSupplier() {
    const [keyword, setKeyword] = useState('');
    const [exporting, setExporting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [actionError, setActionError] = useState('');
    const { data, count, total, page, setPage, loading, error, reload } = usePagedAdminList(getAllSupplier, { keyword });
    const busy = loading || deleting;
    const remove = async () => {
        if (busy || !deleteTarget) return;
        setDeleting(true); setActionError('');
        try {
            const response = await deleteSupplierService({ data: { id: deleteTarget.id } });
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể xóa nhà cung cấp.');
            toast.success('Xóa nhà cung cấp thành công'); setDeleteTarget(null); reload();
        } catch (failure) { setActionError(failure.message || 'Không thể xóa nhà cung cấp.'); }
        finally { setDeleting(false); }
    };
    const exportList = async () => {
        if (exporting) return;
        setExporting(true); setActionError('');
        try {
            const response = await getAllSupplier({ keyword });
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể xuất nhà cung cấp.');
            if (!response.data?.length) throw new Error('Không có nhà cung cấp phù hợp để xuất.');
            await CommonUtils.exportExcel(response.data, 'Danh sách nhà cung cấp', 'ListSupplier');
        } catch (failure) { setActionError(failure.message || 'Không thể xuất nhà cung cấp.'); }
        finally { setExporting(false); }
    };
    return <div className="staff-tools">
        <div className="staff-tools-header"><div><h1>Quản lý nhà cung cấp</h1><p>Tra cứu đối tác và cập nhật thông tin nhập hàng.</p></div><Link to="/system/home/add-supplier" className="btn btn-primary">+ Thêm nhà cung cấp</Link></div>
        <section className="staff-tools-panel" aria-label="Danh sách nhà cung cấp">
            <div className="staff-tools-toolbar"><FormSearch title="tên nhà cung cấp" handleSearch={value => { setKeyword(value.trim()); setPage(0); setDeleteTarget(null); }} handleOnchange={value => { if (!value) { setKeyword(''); setPage(0); setDeleteTarget(null); } }} /><button type="button" className="btn btn-success" disabled={exporting || deleting} onClick={exportList}>{exporting ? 'Đang xuất…' : 'Xuất Excel'}</button></div>
            <p role="status" className="staff-tools-status">{loading ? 'Đang tải nhà cung cấp…' : `${total.toLocaleString('vi-VN')} nhà cung cấp`}</p>
            {error && <p role="alert" className="staff-tools-error">{error} <button type="button" className="btn btn-outline-secondary" onClick={reload}>Thử lại</button></p>}
            {actionError && <p role="alert" className="staff-tools-error">{actionError}</p>}
            {deleteTarget && <div className="staff-tools-confirm" role="region" aria-label="Xác nhận xóa nhà cung cấp"><p>Xóa nhà cung cấp <strong>{deleteTarget.name}</strong>?</p><div className="staff-tools-actions"><button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>{deleting ? 'Đang xóa…' : 'Xác nhận xóa'}</button><button type="button" className="btn btn-outline-secondary" disabled={deleting} onClick={() => { setDeleteTarget(null); setActionError(''); }}>Hủy</button></div></div>}
            <div className="table-responsive" aria-busy={loading}><table className="table table-bordered" inert={busy ? true : undefined}><thead><tr><th scope="col">STT</th><th scope="col">Tên</th><th scope="col">Số điện thoại</th><th scope="col">Email</th><th scope="col">Địa chỉ</th><th scope="col">Thao tác</th></tr></thead><tbody>
                {!loading && !data.length && <tr><td colSpan={6} className="staff-tools-empty">{error ? 'Dữ liệu chưa tải được.' : 'Không có nhà cung cấp phù hợp.'}</td></tr>}
                {data.map((row, index) => <tr key={row.id}><td>{page * PAGINATION.pagerow + index + 1}</td><td>{row.name}</td><td>{row.phonenumber || '—'}</td><td>{row.email || '—'}</td><td>{row.address || '—'}</td><td><div className="staff-tools-row-actions"><Link to={`/system/home/edit-supplier/${row.id}`}>Chỉnh sửa</Link><button type="button" disabled={busy} onClick={() => { setDeleteTarget(row); setActionError(''); }} aria-label={`Xóa nhà cung cấp ${row.name}`}>Xóa</button></div></td></tr>)}
            </tbody></table></div>
            <AdminPagination pageCount={count} forcePage={page} loading={busy} total={total} pageSize={PAGINATION.pagerow} onPageChange={({ selected }) => { setPage(selected); setDeleteTarget(null); }} ariaLabel="Phân trang nhà cung cấp" />
        </section>
    </div>;
}
