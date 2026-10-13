import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getDetailOrder, updateStatusOrderService } from '../../../services/userService';
import { assignShippingOrder, completeShippingOrder, getActiveShippers } from '../../../services/shippingService';
import OrderDetails from '../../../component/Order/OrderDetails';
import { CancelOrderForm, ShipperRating } from '../../../component/Order/OrderForms';
import { mergeOrderUpdate, shipperName } from '../../../utils/orders';
import ReturnWorkflow from '../../../component/Order/ReturnWorkflow';
import DeliveryExceptions from '../../../component/Order/DeliveryExceptions';
import CarrierShipment from '../../../component/Order/CarrierShipment';
import useRefreshOnReturn from '../../../hooks/useRefreshOnReturn';
import '../../../component/Order/OrderWorkflow.scss';

export default function DetailOrder() {
    const { id } = useParams();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [shippers, setShippers] = useState([]);
    const [shipperError, setShipperError] = useState('');
    const [shippersLoading, setShippersLoading] = useState(false);
    const [shipperId, setShipperId] = useState('');
    const [busy, setBusy] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [completing, setCompleting] = useState(false);
    const request = useRef(0);
    const controller = useRef(null);
    const mounted = useRef(false);
    const submitting = useRef(null);
    const shipperRequest = useRef(0);
    const currentOrderId = useRef(id);
    currentOrderId.current = id;

    const loadOrder = useCallback(async ({ fresh = false } = {}) => {
        if (currentOrderId.current !== id) return;
        const current = ++request.current;
        controller.current?.abort();
        const active = new AbortController();
        controller.current = active;
        setLoading(true); setError('');
        try {
            const response = await getDetailOrder(id, { signal: active.signal, fresh });
            if (response?.errCode !== 0 || !response.data) throw new Error(response?.errMessage || 'Không tìm thấy đơn hàng.');
            if (current === request.current) setOrder(response.data);
        } catch (failure) { if (current === request.current) setError(failure.message); }
        finally { if (current === request.current) setLoading(false); }
    }, [id]);
    useEffect(() => { const requests = request; const pending = controller; const shipperRequests = shipperRequest; mounted.current = true; setOrder(null); loadOrder(); return () => { mounted.current = false; requests.current += 1; shipperRequests.current += 1; pending.current?.abort(); }; }, [loadOrder]);
    useEffect(() => { setCancelling(false); setCompleting(false); setShipperId(''); setActionError(''); setBusy(false); }, [id]);
    useRefreshOnReturn(loadOrder, !loading && !busy);
    const refreshOrder = useCallback(updated => {
        if (String(updated?.id) === id && currentOrderId.current === id) {
            setOrder(previous => mergeOrderUpdate(previous, updated));
            loadOrder({ fresh: true });
        } else return loadOrder({ fresh: true });
    }, [id, loadOrder]);
    const loadShippers = useCallback(async () => {
        const current = ++shipperRequest.current;
        setShipperError(''); setShippersLoading(true);
        try {
            const response = await getActiveShippers();
            if (!mounted.current || current !== shipperRequest.current) return;
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải người giao hàng.');
            setShippers(response.data || []);
        } catch (failure) { if (mounted.current && current === shipperRequest.current) setShipperError(failure.message); }
        finally { if (mounted.current && current === shipperRequest.current) setShippersLoading(false); }
    }, []);
    useEffect(() => { if (String(order?.id) === id && order?.statusId === 'S4') loadShippers(); }, [id, order?.id, order?.statusId, loadShippers]);

    const perform = async (operation, message) => {
        if (loading || (submitting.current && submitting.current.id === id)) return;
        const submission = { id };
        submitting.current = submission;
        setBusy(true); setActionError('');
        try {
            const response = await operation();
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể cập nhật đơn hàng.');
            if (!mounted.current || currentOrderId.current !== id) return;
            if (String(response.data?.id) === id) setOrder(previous => mergeOrderUpdate(previous, response.data));
            toast.success(message); setCancelling(false); setCompleting(false); await loadOrder({ fresh: true });
        } catch (failure) { if (mounted.current && currentOrderId.current === id) setActionError(failure.message); }
        finally { if (submitting.current === submission) submitting.current = null; if (mounted.current && currentOrderId.current === id) setBusy(false); }
    };

    const startDeliveryAction = () => {
        if (loading || submitting.current) return false;
        submitting.current = { id, source: 'delivery' };
        setBusy(true); setActionError('');
        return true;
    };
    const finishDeliveryAction = () => {
        if (submitting.current?.id === id && submitting.current.source === 'delivery') submitting.current = null;
        if (mounted.current && currentOrderId.current === id) setBusy(false);
    };

    return <main className="order-workflow">
        <Link to="/system/home/list-order">← Danh sách đơn hàng</Link>
        <h1 className="h3 mt-3">Chi tiết đơn hàng</h1>
        <p role="status" className="order-refresh-status">{loading ? order ? 'Đang cập nhật đơn hàng…' : 'Đang tải đơn hàng…' : ''}</p>
        {error && <div role="alert"><p>{error}</p><button type="button" className="btn btn-outline-success" onClick={loadOrder}>Thử lại</button></div>}
        {order && String(order.id) === id && <article className="order-card" aria-busy={loading}>
            <OrderDetails order={order} />
            <ShipperRating order={order} />
            <CarrierShipment key={`carrier-${order.id}`} order={order} admin onUpdated={refreshOrder} />
            <DeliveryExceptions key={`exceptions-${order.id}`} order={order} admin onUpdated={refreshOrder} disabled={busy || loading || !!error} onActionStart={startDeliveryAction} onActionEnd={finishDeliveryAction} />
            <ReturnWorkflow key={`return-${order.id}`} order={order} admin onUpdated={refreshOrder} />
            {actionError && <p role="alert" className="text-danger">{actionError}</p>}
            <div className="order-actions">
                {order.statusId === 'S3' && <button className="btn btn-success" type="button" disabled={busy || loading || !!error} onClick={() => perform(() => updateStatusOrderService({ id: order.id, statusId: 'S4' }), 'Đã xác nhận đơn hàng.')}>{busy ? 'Đang cập nhật…' : 'Xác nhận đơn hàng'}</button>}
                {['S3', 'S4'].includes(order.statusId) && Number(order.isPaymentOnlien) === 0 && !order.shipment && (!order.deliveryProvider || order.deliveryProvider === 'internal') && <button className="btn btn-outline-danger" type="button" disabled={busy || loading || !!error} onClick={() => setCancelling(true)}>Hủy đơn</button>}
                {order.statusId === 'S5' && order.shipperId && <button className="btn btn-success" type="button" disabled={busy || loading || !!error} onClick={() => setCompleting(true)}>Xác nhận giao hàng</button>}
            </div>
            {order.statusId === 'S4' && !order.shipperId && !order.shipment && (!order.deliveryProvider || order.deliveryProvider === 'internal') && <form className="order-action-form" onSubmit={event => { event.preventDefault(); if (shipperId) perform(() => assignShippingOrder(order.id, Number(shipperId)), 'Đã phân công người giao hàng.'); }}>
                <h3 className="h5">Phân công giao hàng</h3><p>Chọn người giao hàng để bắt đầu giao đơn này.</p>
                {shippersLoading ? <p role="status">Đang tải người giao hàng…</p> : shipperError ? <div role="alert"><p>{shipperError}</p><button type="button" className="btn btn-outline-secondary" onClick={loadShippers}>Tải lại người giao hàng</button></div> : <>
                    <label>Người giao hàng<select className="form-select mt-2 mb-3" value={shipperId} onChange={event => setShipperId(event.target.value)} disabled={busy || loading || !!error} required><option value="">Chọn người giao hàng</option>{shippers.map(shipper => <option key={shipper.id} value={shipper.id}>{shipperName(shipper)}{shipper.phonenumber ? ` · ${shipper.phonenumber}` : ''}</option>)}</select></label>
                    {!shippers.length && <p>Chưa có tài khoản người giao hàng đang hoạt động.</p>}
                    <button type="submit" className="btn btn-success" disabled={busy || !shipperId}>{busy ? 'Đang phân công…' : 'Phân công và gửi hàng'}</button>
                </>}
            </form>}
            {cancelling && <CancelOrderForm busy={busy || loading || !!error} onClose={() => setCancelling(false)} onSubmit={cancelReason => perform(() => updateStatusOrderService({ id: order.id, statusId: 'S7', cancelReason }), 'Đã hủy đơn hàng.')} />}
            {completing && <div className="order-action-form"><p>Xác nhận đơn #{order.id} đã giao đến khách hàng?</p><div className="order-actions"><button type="button" className="btn btn-success" disabled={busy || loading || !!error} onClick={() => perform(() => completeShippingOrder(order.id), 'Đã xác nhận giao hàng thành công.')}>{busy ? 'Đang cập nhật…' : 'Đã giao thành công'}</button><button type="button" className="btn btn-outline-secondary" disabled={busy || loading || !!error} onClick={() => setCompleting(false)}>Quay lại</button></div></div>}
        </article>}
    </main>;
}
