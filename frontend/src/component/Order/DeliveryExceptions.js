import React, { useRef, useState } from 'react';
import { reportDeliveryFailure, retryDelivery, startReturnToWarehouse, receiveUndeliveredReturn } from '../../services/orderOperationsService';
import { ReasonForm, WarehouseReceiptForm } from './WorkflowForms';

export default function DeliveryExceptions({ order, admin = false, onUpdated }) {
    const [action, setAction] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const orderId = useRef(order.id);
    orderId.current = order.id;
    const internal = !order.shipment && (!order.deliveryProvider || order.deliveryProvider === 'internal');
    if (!internal || !['S5', 'S8', 'S9'].includes(order.statusId) || !order.shipperId) return null;
    const perform = async operation => {
        if (busy) return;
        const id = order.id;
        setBusy(true); setError('');
        try {
            const response = await operation();
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể cập nhật giao hàng.');
            if (orderId.current !== id) return;
            setAction(''); await onUpdated?.();
        } catch (failure) { if (orderId.current === id) setError(failure.message); }
        finally { if (orderId.current === id) setBusy(false); }
    };
    return <section className="order-section" aria-label="Xử lý giao hàng">
        {order.statusId === 'S8' && <p>Đơn giao không thành công. Cần giao lại hoặc đưa hàng về kho; tiền COD chưa được ghi nhận đã thu.</p>}
        {order.statusId === 'S9' && <p>Hàng đang được đưa về cửa hàng. Quản trị sẽ xác nhận khi kho nhận hàng thực tế.</p>}
        {error && <p role="alert" className="text-danger">{error}</p>}
        <div className="order-actions">
            {order.statusId === 'S5' && <button className="btn btn-outline-danger" type="button" disabled={busy} onClick={() => setAction('fail')}>Báo giao không thành công</button>}
            {order.statusId === 'S8' && <><button className="btn btn-outline-success" type="button" disabled={busy} onClick={() => setAction('retry')}>Giao lại đơn hàng</button><button className="btn btn-outline-danger" type="button" disabled={busy} onClick={() => setAction('return')}>Đưa hàng về kho</button></>}
            {admin && order.statusId === 'S9' && <button className="btn btn-success" type="button" disabled={busy} onClick={() => setAction('receive')}>Kiểm nhận đơn giao thất bại</button>}
        </div>
        {action === 'fail' && <ReasonForm title="Giao hàng không thành công" label="Lý do giao thất bại" submitLabel="Ghi nhận giao thất bại" busy={busy} onClose={() => setAction('')} onSubmit={({ reason }) => perform(() => reportDeliveryFailure({ orderId: order.id, reason }))} />}
        {action === 'return' && <ReasonForm title="Đưa đơn hàng về kho" label="Lý do hoàn về kho" submitLabel="Xác nhận đưa về kho" busy={busy} onClose={() => setAction('')} onSubmit={({ reason }) => perform(() => startReturnToWarehouse({ orderId: order.id, reason }))} />}
        {action === 'retry' && <div className="order-action-form"><p>Xác nhận đã liên hệ khách và sẵn sàng giao lại đơn #{order.id}?</p><div className="order-actions"><button className="btn btn-success" type="button" disabled={busy} onClick={() => perform(() => retryDelivery({ orderId: order.id }))}>{busy ? 'Đang cập nhật…' : 'Xác nhận bắt đầu giao lại'}</button><button className="btn btn-outline-secondary" type="button" disabled={busy} onClick={() => setAction('')}>Quay lại</button></div></div>}
        {action === 'receive' && <WarehouseReceiptForm busy={busy} onClose={() => setAction('')} onSubmit={data => perform(() => receiveUndeliveredReturn({ orderId: order.id, ...data }))} />}
    </section>;
}
