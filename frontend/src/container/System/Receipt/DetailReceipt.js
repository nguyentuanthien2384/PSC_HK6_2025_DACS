import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getDetailReceiptByIdService, createNewReceiptDetailService } from '../../../services/userService';
import CommonUtils from '../../../utils/CommonUtils';
import ReceiptLineForm from './ReceiptLineForm';
import useReceiptResources from './useReceiptResources';
import '../StaffTools.scss';

export default function DetailReceipt() {
    const { id } = useParams();
    const resources = useReceiptResources();
    const [version, setVersion] = useState(0);
    const [receipt, setReceipt] = useState({ id: '', loading: true, error: '', data: null });
    useEffect(() => {
        let active = true;
        setReceipt({ id, loading: true, error: '', data: null });
        getDetailReceiptByIdService(id).then(response => {
            if (!active) return;
            if (response?.errCode !== 0 || !response.data) throw new Error(response?.errMessage || 'Không tìm thấy phiếu nhập.');
            setReceipt({ id, loading: false, error: '', data: response.data });
        }).catch(failure => { if (active) setReceipt({ id, loading: false, error: failure.message || 'Không thể tải phiếu nhập.', data: null }); });
        return () => { active = false; };
    }, [id, version]);
    const loading = receipt.id !== id || receipt.loading;
    const lines = receipt.id === id ? receipt.data?.receiptDetail || [] : [];
    const save = async line => {
        const response = await createNewReceiptDetailService({ ...line, receiptId: id });
        if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể thêm hàng vào phiếu nhập.');
        toast.success('Thêm chi tiết nhập hàng thành công'); setVersion(old => old + 1);
    };
    return <div className="staff-tools">
        <Link to="/system/home/list-receipt" className="staff-tools-back">← Danh sách phiếu nhập</Link>
        <div className="staff-tools-header"><div><h1>Chi tiết phiếu nhập #{id}</h1><p>Xem hàng đã nhập và thêm các dòng hàng vào phiếu.</p></div></div>
        {receipt.error && <p role="alert" className="staff-tools-error">{receipt.error} <button type="button" className="btn btn-outline-secondary" onClick={() => setVersion(old => old + 1)}>Thử lại</button></p>}
        <section className="staff-tools-panel" aria-busy={loading}><h2>Danh sách hàng nhập</h2>{loading && <p role="status">Đang tải phiếu nhập…</p>}<div className="table-responsive"><table className="table table-bordered"><thead><tr><th scope="col">STT</th><th scope="col">Sản phẩm / biến thể / kích thước</th><th scope="col">Số lượng</th><th scope="col">Đơn giá</th></tr></thead><tbody>
            {!loading && !lines.length && <tr><td colSpan={4} className="staff-tools-empty">{receipt.error ? 'Dữ liệu chưa tải được.' : 'Phiếu nhập chưa có hàng.'}</td></tr>}
            {lines.map((line, index) => <tr key={line.id || index}><td>{index + 1}</td><td>{[line.productData?.name || 'Sản phẩm không còn tồn tại', line.productDetailData?.nameDetail, line.productDetailSizeData?.sizeData?.value || line.productDetailSizeData?.sizeId].filter(Boolean).join(' · ')}</td><td>{line.quantity}</td><td>{CommonUtils.formatter.format(line.price || 0)}</td></tr>)}
        </tbody></table></div></section>
        <section className="staff-tools-panel" aria-busy={resources.loading}><h2>Thêm hàng vào phiếu nhập</h2>
            {resources.loading && <p role="status">Đang tải sản phẩm…</p>}
            {resources.error && <p role="alert" className="staff-tools-error">{resources.error} <button type="button" className="btn btn-outline-secondary" onClick={resources.reload}>Thử lại</button></p>}
            <ReceiptLineForm key={id} products={resources.products} sizeCodes={resources.sizeCodes} disabled={resources.loading || !!resources.error || loading || !!receipt.error} onSave={save} submitLabel="Thêm vào phiếu nhập" />
        </section>
    </div>;
}
