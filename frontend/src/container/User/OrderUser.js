import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getAllOrdersByUser, updateStatusOrderService } from '../../services/userService';
import { getUser } from '../../utils/token';
import { canCustomerCancel, canCustomerConfirmReceipt, canCustomerRateShipper, flattenCustomerOrders, formatOrderDate, formatOrderMoney, orderTotals, ORDER_STATUSES, paymentLabel } from '../../utils/orders';
import OrderDetails, { ShipperInfo } from '../../component/Order/OrderDetails';
import { CancelOrderForm, ShipperRating } from '../../component/Order/OrderForms';
import ReturnWorkflow from '../../component/Order/ReturnWorkflow';
import CarrierShipment from '../../component/Order/CarrierShipment';
import '../../component/Order/OrderWorkflow.scss';

export default function OrderUser() {
    const id = getUser()?.id;
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('ALL');
    const [keyword, setKeyword] = useState('');
    const [expanded, setExpanded] = useState(null);
    const [cancelling, setCancelling] = useState(null);
    const [confirming, setConfirming] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const request = useRef(0);

    const loadOrders = useCallback(async () => {
        const current = ++request.current;
        setLoading(true); setError('');
        try {
            const response = await getAllOrdersByUser(id);
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải đơn hàng.');
            if (current === request.current) setOrders(flattenCustomerOrders(response.data));
        } catch (failure) { if (current === request.current) setError(failure.message); }
        finally { if (current === request.current) setLoading(false); }
    }, [id]);
    useEffect(() => { const requests = request; loadOrders(); return () => { requests.current += 1; }; }, [loadOrders]);

    const updateOrder = async (order, statusId, cancelReason) => {
        if (busyId) return;
        setBusyId(order.id);
        try {
            const response = await updateStatusOrderService({ id: order.id, statusId, ...(cancelReason ? { cancelReason } : {}) });
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể cập nhật đơn hàng.');
            toast.success(statusId === 'S7' ? 'Đã hủy đơn hàng.' : 'Đã xác nhận nhận hàng. Bạn có thể đánh giá người giao hàng.');
            setCancelling(null); setConfirming(null);
            await loadOrders();
        } catch (failure) { toast.error(failure.message); }
        finally { setBusyId(null); }
    };
    const search = keyword.trim().toLowerCase();
    const filtered = orders.filter(order => (status === 'ALL' || order.statusId === status) && (!search || String(order.id).includes(search) || order.orderDetail?.some(line => line.product?.name?.toLowerCase().includes(search))));

    return <div className="order-workflow">
        <h1 className="h3">Đơn hàng của tôi</h1>
        <div className="order-filters"><label>Trạng thái <select value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">Tất cả</option>{Object.entries(ORDER_STATUSES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Tìm đơn hàng <input type="search" value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="Mã đơn hoặc tên sản phẩm" /></label></div>
        {loading && <p role="status" className="order-status-message">Đang tải đơn hàng…</p>}
        {error && <div role="alert" className="order-status-message"><p>{error}</p><button type="button" className="btn btn-outline-success" onClick={loadOrders}>Thử lại</button></div>}
        {!loading && !error && !filtered.length && <p className="order-status-message">{orders.length ? 'Không có đơn hàng phù hợp.' : <>Bạn chưa có đơn hàng nào. <Link to="/shop">Mua sắm ngay</Link></>}</p>}
        {!loading && !error && filtered.map(order => <article key={order.id} className="order-card" aria-label={`Đơn hàng ${order.id}`}>
            <div className="order-heading"><h2>Đơn hàng #{order.id}</h2><span>{order.statusOrderData?.value || ORDER_STATUSES[order.statusId]}</span></div>
            <p>Ngày đặt: {formatOrderDate(order.createdAt)}</p>
            <p>{(order.orderDetail || []).map(line => `${line.product?.name || 'Sản phẩm đã mua'} × ${line.quantity}`).join(', ')}</p>
            <p><strong>Tổng thanh toán: {formatOrderMoney(orderTotals(order).totalPrice)}</strong> · {paymentLabel(order)}</p>
            <ShipperInfo order={order} />
            <CarrierShipment key={`carrier-${order.id}`} order={order} />
            {order.cancellationReason && <p>Lý do hủy: {order.cancellationReason}</p>}
            <div className="order-actions">
                <button type="button" className="btn btn-outline-secondary" aria-expanded={expanded === order.id} onClick={() => setExpanded(expanded === order.id ? null : order.id)}>{expanded === order.id ? 'Thu gọn' : 'Xem chi tiết'}</button>
                {canCustomerCancel(order) && <button type="button" className="btn btn-outline-danger" disabled={Boolean(busyId)} onClick={() => { setCancelling(order.id); setConfirming(null); }}>Hủy đơn</button>}
                {canCustomerConfirmReceipt(order) && <button type="button" className="btn btn-success" disabled={Boolean(busyId)} onClick={() => { setConfirming(order.id); setCancelling(null); }}>Đã nhận hàng</button>}
            </div>
            {expanded === order.id && <OrderDetails order={order} compact />}
            {cancelling === order.id && <CancelOrderForm busy={busyId === order.id} onClose={() => setCancelling(null)} onSubmit={reason => updateOrder(order, 'S7', reason)} />}
            {confirming === order.id && <div className="order-action-form"><p>Bạn đã nhận đủ hàng của đơn #{order.id}?</p><div className="order-actions"><button type="button" className="btn btn-success" disabled={Boolean(busyId)} onClick={() => updateOrder(order, 'S6')}>{busyId === order.id ? 'Đang xác nhận…' : 'Xác nhận đã nhận hàng'}</button><button type="button" className="btn btn-outline-secondary" disabled={Boolean(busyId)} onClick={() => setConfirming(null)}>Chưa nhận hàng</button></div></div>}
            <ShipperRating order={order} allowSubmit={canCustomerRateShipper(order)} onRated={loadOrders} />
            <ReturnWorkflow key={`return-${order.id}`} order={order} onUpdated={loadOrders} />
        </article>)}
    </div>;
}
