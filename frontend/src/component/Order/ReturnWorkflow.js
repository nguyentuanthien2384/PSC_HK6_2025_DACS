import React, { useEffect, useRef, useState } from 'react';
import { createReturnRequest, reviewReturnRequest, markReturnShipped, receiveReturn, confirmManualRefund, requestOnlineRefund } from '../../services/orderOperationsService';
import { formatOrderDate, formatOrderMoney, RETURN_STATUSES } from '../../utils/orders';
import { isDemoPayment } from '../../utils/payments';
import { EvidenceInput, ReasonForm, WarehouseReceiptForm } from './WorkflowForms';

function ReturnTrackingForm({ busy, onSubmit, onClose }) {
    const [carrier, setCarrier] = useState('');
    const [trackingNumber, setTrackingNumber] = useState('');
    return <form className="order-action-form" onSubmit={event => { event.preventDefault(); if (carrier.trim() && trackingNumber.trim() && !busy) onSubmit({ carrier: carrier.trim(), trackingNumber: trackingNumber.trim() }); }}>
        <h3 className="h5">Thông tin hàng gửi trả</h3><p>Gửi hàng theo hướng dẫn của cửa hàng, sau đó nhập mã vận đơn thực tế để cửa hàng kiểm nhận.</p>
        <label>Hãng vận chuyển trả hàng<input className="form-control" required maxLength={100} disabled={busy} value={carrier} onChange={event => setCarrier(event.target.value)} /></label>
        <label>Mã vận đơn trả hàng<input className="form-control" required maxLength={100} disabled={busy} value={trackingNumber} onChange={event => setTrackingNumber(event.target.value)} /></label>
        <div className="order-actions"><button type="submit" className="btn btn-success" disabled={busy || !carrier.trim() || !trackingNumber.trim()}>{busy ? 'Đang gửi…' : 'Xác nhận đã gửi hàng trả'}</button><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Quay lại</button></div>
    </form>;
}

function ManualRefundForm({ busy, onSubmit, onClose }) {
    const [paymentReference, setPaymentReference] = useState('');
    const [paymentProof, setPaymentProof] = useState('');
    const [invalid, setInvalid] = useState(false);
    return <form className="order-action-form" onSubmit={event => { event.preventDefault(); if (!busy && paymentReference.trim() && paymentProof && !invalid) onSubmit({ paymentReference: paymentReference.trim(), paymentProof }); }}>
        <h3 className="h5">Ghi nhận hoàn tiền cho đơn COD</h3><p>Thực hiện chuyển khoản hoặc trả tiền cho khách trước. Nhập số giao dịch và ảnh chứng từ của khoản hoàn thực tế.</p>
        <label>Mã giao dịch / số phiếu hoàn tiền<input className="form-control" required maxLength={200} disabled={busy} value={paymentReference} onChange={event => setPaymentReference(event.target.value)} /></label>
        <EvidenceInput label="Chứng từ hoàn tiền (bắt buộc)" busy={busy} onChange={(value, pending) => { setPaymentProof(value); setInvalid(pending); }} />
        <div className="order-actions"><button type="submit" className="btn btn-success" disabled={busy || invalid || !paymentReference.trim() || !paymentProof}>{busy ? 'Đang ghi nhận…' : 'Ghi nhận tiền đã hoàn'}</button><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Quay lại</button></div>
    </form>;
}

export default function ReturnWorkflow(props) {
    return <ReturnWorkflowForOrder key={`${props.order.id}-${props.admin ? 'admin' : 'customer'}`} {...props} />;
}

function ReturnWorkflowForOrder({ order, admin = false, onUpdated }) {
    const [action, setAction] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const mounted = useRef(true);
    const pending = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const request = order.returnRequest;
    const eligibility = order.returnEligibility;
    const perform = async (operation, message) => {
        if (pending.current) return;
        pending.current = true;
        setBusy(true); setError(''); setSuccess('');
        try {
            const response = await operation();
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể xử lý yêu cầu trả hàng.');
            if (!mounted.current) return;
            setAction(''); setSuccess(typeof message === 'function' ? message(response) : message);
            await onUpdated?.();
        } catch (failure) { if (mounted.current) setError(failure.message); }
        finally { pending.current = false; if (mounted.current) setBusy(false); }
    };
    if (!request && !eligibility && order.statusId !== 'S6') return null;
    return <section className="order-section return-workflow" aria-label="Trả hàng và hoàn tiền">
        <h3>Trả hàng / hoàn tiền</h3>
        {!request && <p>{eligibility?.canRequest ? `Có thể yêu cầu trả toàn bộ đơn trong ${eligibility.windowDays} ngày kể từ khi giao thành công.` : eligibility?.reason || 'Đơn chưa đủ điều kiện yêu cầu trả hàng.'}</p>}
        {eligibility?.deadline && <p>Hạn gửi yêu cầu: {formatOrderDate(eligibility.deadline)}</p>}
        {request && <div className="order-return-status"><p><strong>{RETURN_STATUSES[request.status] || request.status}</strong></p><p>Lý do: {request.reason}</p>
            {request.evidence && <a href={request.evidence} target="_blank" rel="noreferrer"><img className="delivery-proof" src={request.evidence} alt="Minh chứng yêu cầu trả hàng" /></a>}
            {(request.reviewNote || request.note) && <p>Hướng dẫn / phản hồi cửa hàng: {request.reviewNote || request.note}</p>}
            {request.trackingNumber && <p>Vận đơn trả: {request.carrier} · {request.trackingNumber}</p>}
            {request.inspectionNote && <p>Kiểm nhận kho: {request.inspectionNote}</p>}
            {request.amount != null && <p>Số tiền hoàn: <strong>{formatOrderMoney(request.amount)}</strong></p>}
            {request.status === 'REFUND_PENDING' && <p>Chưa xác nhận tiền đã về tài khoản khách hàng. Cửa hàng đang xử lý khoản hoàn.</p>}
            {request.refundReference && <p>Tham chiếu hoàn tiền: {request.refundReference}</p>}
            {request.refundProviderStatus && <p>Trạng thái cổng hoàn tiền: {request.refundProviderStatus}</p>}
            {request.refundedAt && <p>Hoàn tiền lúc: {formatOrderDate(request.refundedAt)}</p>}
        </div>}
        {error && <p role="alert" className="text-danger">{error}</p>}{success && <p role="status">{success}</p>}
        {admin && Number(order.isPaymentOnlien) === 1 && isDemoPayment(order.paymentSession) && <p role="note">Đơn dùng dữ liệu thanh toán demo / mô phỏng. Không thể yêu cầu hoàn tiền qua cổng thanh toán.</p>}
        <div className="order-actions">
            {!admin && eligibility?.canRequest === true && (!request || request.status === 'REJECTED') && <button className="btn btn-outline-danger" type="button" disabled={busy} onClick={() => setAction('request')}>Yêu cầu trả hàng</button>}
            {!admin && request?.status === 'APPROVED' && <button className="btn btn-outline-success" type="button" disabled={busy} onClick={() => setAction('ship')}>Nhập vận đơn gửi trả</button>}
            {admin && request?.status === 'REQUESTED' && <><button type="button" className="btn btn-success" disabled={busy} onClick={() => setAction('approve')}>Duyệt trả hàng</button><button type="button" className="btn btn-outline-danger" disabled={busy} onClick={() => setAction('reject')}>Từ chối trả hàng</button></>}
            {admin && request?.status === 'SHIPPED' && <button type="button" className="btn btn-success" disabled={busy} onClick={() => setAction('receive')}>Kiểm nhận hàng trả tại kho</button>}
            {admin && request?.status === 'REFUND_PENDING' && !isDemoPayment(order.paymentSession) && (Number(order.isPaymentOnlien) === 1 ? <button type="button" className="btn btn-success" disabled={busy || !request.id} onClick={() => perform(() => requestOnlineRefund(request.id), response => response.data?.status === 'REFUNDED' ? 'Cổng thanh toán đã xác nhận hoàn tiền thành công.' : 'Khoản hoàn vẫn chờ cổng thanh toán xác minh. Chưa có xác nhận tiền đã hoàn.')}>{busy ? 'Đang xử lý…' : 'Yêu cầu hoàn tiền trực tuyến'}</button> : <button type="button" className="btn btn-success" disabled={busy} onClick={() => setAction('refund')}>Ghi nhận hoàn tiền COD</button>)}
        </div>
        {action === 'request' && <ReasonForm title={`Trả toàn bộ đơn #${order.id}`} label="Lý do trả hàng" submitLabel="Gửi yêu cầu trả hàng" evidence busy={busy} onClose={() => setAction('')} onSubmit={data => perform(() => createReturnRequest({ orderId: order.id, ...data }), 'Đã gửi yêu cầu. Vui lòng chờ cửa hàng duyệt trước khi gửi hàng trả.')} />}
        {action === 'ship' && <ReturnTrackingForm busy={busy} onClose={() => setAction('')} onSubmit={data => perform(() => markReturnShipped({ orderId: order.id, ...data }), 'Đã ghi nhận vận đơn gửi trả.')} />}
        {['approve', 'reject'].includes(action) && <ReasonForm title={action === 'approve' ? 'Duyệt và hướng dẫn trả hàng' : 'Từ chối yêu cầu trả hàng'} label={action === 'approve' ? 'Địa chỉ kho và hướng dẫn gửi trả' : 'Lý do từ chối'} submitLabel={action === 'approve' ? 'Xác nhận duyệt trả hàng' : 'Xác nhận từ chối'} busy={busy} onClose={() => setAction('')} onSubmit={({ reason }) => perform(() => reviewReturnRequest({ orderId: order.id, decision: action === 'approve' ? 'APPROVE' : 'REJECT', note: reason }), 'Đã phản hồi yêu cầu trả hàng.')} />}
        {action === 'receive' && <WarehouseReceiptForm busy={busy} onClose={() => setAction('')} onSubmit={data => perform(() => receiveReturn({ orderId: order.id, ...data }), 'Đã kiểm nhận hàng. Khoản hoàn đang chờ xử lý.')} />}
        {action === 'refund' && <ManualRefundForm busy={busy} onClose={() => setAction('')} onSubmit={data => perform(() => confirmManualRefund({ orderId: order.id, ...data }), 'Đã ghi nhận chứng từ hoàn tiền cho khách.')} />}
    </section>;
}
