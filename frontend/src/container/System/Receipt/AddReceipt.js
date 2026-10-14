import React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { createNewReceiptService } from '../../../services/userService';
import ReceiptLineForm from './ReceiptLineForm';
import useReceiptResources from './useReceiptResources';
import '../StaffTools.scss';

export default function AddReceipt() {
    const { products, suppliers, sizeCodes, loading, error, reload } = useReceiptResources(true);
    const save = async line => {
        const response = await createNewReceiptService(line);
        if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tạo phiếu nhập.');
        toast.success('Tạo phiếu nhập thành công');
    };
    return <div className="staff-tools">
        <Link to="/system/home/list-receipt" className="staff-tools-back">← Danh sách phiếu nhập</Link>
        <div className="staff-tools-header"><div><h1>Tạo phiếu nhập hàng</h1><p>Chọn nhà cung cấp, biến thể và số lượng thực tế nhập kho.</p></div></div>
        <section className="staff-tools-panel" aria-busy={loading}>
            {loading && <p role="status">Đang tải sản phẩm và nhà cung cấp…</p>}
            {error && <p role="alert" className="staff-tools-error">{error} <button type="button" className="btn btn-outline-secondary" onClick={reload}>Thử lại</button></p>}
            <ReceiptLineForm products={products} suppliers={suppliers} sizeCodes={sizeCodes} withSupplier disabled={loading || !!error} onSave={save} submitLabel="Lưu phiếu nhập" />
        </section>
    </div>;
}
