import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { assignShippingOrder, completeShippingOrder, getAvailableShippingOrders, getShipperOrders } from '../../services/shippingService';
import OrderDetails from '../../component/Order/OrderDetails';
import { ShipperRating } from '../../component/Order/OrderForms';
import DeliveryExceptions from '../../component/Order/DeliveryExceptions';
import { formatOrderDate, formatOrderMoney, mergeOrderUpdate, orderTotals, ORDER_STATUSES, paymentLabel } from '../../utils/orders';
import { getUser } from '../../utils/token';
import useRefreshOnReturn from '../../hooks/useRefreshOnReturn';
import '../../component/Order/OrderWorkflow.scss';

const tabs = { available: 'Đơn chờ nhận', working: 'Đang giao', done: 'Lịch sử giao hàng' };

export function DeliveryForm({ order, busy, onSubmit, onClose }) {
    const [image, setImage] = useState('');
    const [error, setError] = useState('');
    const [reading, setReading] = useState(false);
    const selection = useRef(0);
    const selectImage = async (event) => {
        const current = ++selection.current;
        const file = event.target.files?.[0];
        setImage(''); setError('');
        if (!file) { setReading(false); return; }
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
            setError('Chọn ảnh PNG, JPEG, WebP hoặc GIF tối đa 5 MB.'); setReading(false); event.target.value = ''; return;
        }
        setReading(true);
        const reader = new FileReader();
        reader.onload = () => { if (current === selection.current) { setImage(reader.result); setReading(false); } };
        reader.onerror = () => { if (current === selection.current) { setError('Không thể đọc ảnh. Vui lòng chọn lại.'); setReading(false); } };
        reader.readAsDataURL(file);
    };
    useEffect(() => { const selections = selection; return () => { selections.current += 1; }; }, []);
    return <form className="order-action-form delivery-form" onSubmit={event => { event.preventDefault(); if (!busy && !reading && !error) onSubmit(image); }}>
        <h3 className="h5">Xác nhận giao đơn #{order.id}</h3><p>Chỉ xác nhận sau khi khách hàng đã nhận đủ hàng{Number(order.isPaymentOnlien) === 0 ? ' và đã thanh toán tiền mặt' : ''}.</p>
        <label>Ảnh giao hàng (không bắt buộc)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={selectImage} disabled={busy} /></label>
        <small>Ảnh PNG, JPEG, WebP hoặc GIF, tối đa 5 MB.</small>
        {reading && <p role="status">Đang đọc ảnh…</p>}
        {image && <img className="delivery-proof" src={image} alt="Ảnh giao hàng đã chọn" />}
        {error && <p role="alert" className="text-danger">{error}</p>}
        <div className="order-actions mt-3"><button type="submit" className="btn btn-success" disabled={busy || reading || Boolean(error)}>{busy ? 'Đang cập nhật…' : 'Đã giao thành công'}</button><button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Quay lại</button></div>
    </form>;
}

export default function ShipperPage() {
    const userId = getUser()?.id;
    const [tab, setTab] = useState('working');
    const [data, setData] = useState({ available: [], working: [], done: [] });
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState({ available: true, working: true, done: true });
    const [loaded, setLoaded] = useState({ available: false, working: false, done: false });
    const [errors, setErrors] = useState({ available: '', working: '', done: '' });
    const [actionError, setActionError] = useState('');
    const [busyId, setBusyId] = useState(null);
    const [claiming, setClaiming] = useState(null);
    const [completing, setCompleting] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const [keyword, setKeyword] = useState('');
    const request = useRef({ available: 0, working: 0, done: 0 });
    const controllers = useRef({});
    const mounted = useRef(true);
    const actionPending = useRef(false);

    const loadOrders = useCallback(async ({ fresh = false } = {}) => {
        await Promise.all(Object.keys(tabs).map(async key => {
            const current = ++request.current[key];
            controllers.current[key]?.abort();
            const controller = new AbortController();
            controllers.current[key] = controller;
            setLoading(previous => ({ ...previous, [key]: true }));
            setErrors(previous => ({ ...previous, [key]: '' }));
            try {
                const options = { signal: controller.signal, fresh };
                const response = await (key === 'available' ? getAvailableShippingOrders(options) : getShipperOrders(key, options));
                if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải đơn giao hàng.');
                if (!mounted.current || current !== request.current[key]) return;
                setData(previous => ({ ...previous, [key]: response.data || [] }));
                setLoaded(previous => ({ ...previous, [key]: true }));
                if (response.summary) setSummary(response.summary);
            } catch (failure) {
                if (mounted.current && current === request.current[key] && failure.code !== 'ERR_CANCELED') {
                    setErrors(previous => ({ ...previous, [key]: failure.message }));
                }
            } finally {
                if (mounted.current && current === request.current[key]) {
                    controllers.current[key] = null;
                    setLoading(previous => ({ ...previous, [key]: false }));
                }
            }
        }));
    }, []);
    useEffect(() => {
        mounted.current = true;
        const requests = request.current;
        const activeControllers = controllers.current;
        loadOrders();
        return () => {
            mounted.current = false;
            Object.keys(tabs).forEach(key => { requests[key] += 1; activeControllers[key]?.abort(); });
        };
    }, [loadOrders, userId]);
    const refreshing = Object.values(loading).some(Boolean);
    useRefreshOnReturn(loadOrders, !refreshing && !busyId);

    const cancelReads = () => {
        Object.keys(tabs).forEach(key => { request.current[key] += 1; controllers.current[key]?.abort(); });
        setLoading({ available: false, working: false, done: false });
    };
    const applyUpdate = (updated, original) => {
        if (!updated || !updated.statusId || String(updated.id) !== String(original?.id || updated.id)) return;
        const previousOrder = original || Object.values(data).flat().find(order => String(order.id) === String(updated.id));
        if (!previousOrder) return;
        // Keep the already loaded products/address; the mutation returns order columns only.
        const nextOrder = mergeOrderUpdate(previousOrder, updated);
        let destination;
        if (nextOrder.statusId === 'S4' && !nextOrder.shipperId) destination = 'available';
        if (String(nextOrder.shipperId) === String(userId)) {
            if (['S5', 'S8', 'S9'].includes(nextOrder.statusId)) destination = 'working';
            if (nextOrder.statusId === 'S6') destination = 'done';
        }
        setData(previous => Object.fromEntries(Object.entries(previous).map(([key, orders]) => {
            const existing = orders.findIndex(order => String(order.id) === String(nextOrder.id));
            const remaining = orders.filter(order => String(order.id) !== String(nextOrder.id));
            if (key === destination) remaining.splice(existing < 0 ? 0 : existing, 0, nextOrder);
            return [key, remaining];
        })));
        if (destination) setLoaded(previous => ({ ...previous, [destination]: true }));
        setSummary(previous => previous && ({ ...previous,
            working: Math.max(0, Number(previous.working) + Number(nextOrder.statusId === 'S5') - Number(previousOrder.statusId === 'S5')),
            done: Math.max(0, Number(previous.done) + Number(nextOrder.statusId === 'S6') - Number(previousOrder.statusId === 'S6')),
        }));
    };
    const exceptionUpdated = updated => {
        cancelReads();
        applyUpdate(updated);
        loadOrders({ fresh: true });
    };
    const startException = id => {
        if (actionPending.current) return false;
        actionPending.current = true;
        cancelReads();
        setBusyId(id); setActionError('');
        return true;
    };
    const finishException = () => {
        actionPending.current = false;
        if (mounted.current) setBusyId(null);
    };

    const perform = async (order, operation, message, nextTab) => {
        if (actionPending.current) return;
        actionPending.current = true;
        cancelReads();
        setBusyId(order.id); setActionError('');
        try {
            const response = await operation();
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể cập nhật giao hàng.');
            if (!mounted.current) return;
            applyUpdate(response.data, order);
            toast.success(message); setClaiming(null); setCompleting(null);
            setTab(nextTab); setKeyword(''); setExpanded(null);
            loadOrders({ fresh: true });
        } catch (failure) {
            if (mounted.current) { setActionError(failure.message); loadOrders({ fresh: true }); }
        } finally { actionPending.current = false; if (mounted.current) setBusyId(null); }
    };
    const changeTab = (value) => { setTab(value); setExpanded(null); setClaiming(null); setCompleting(null); setKeyword(''); setActionError(''); };
    const search = keyword.trim().toLowerCase();
    const orders = data[tab].filter(order => !search || String(order.id).includes(search) || [order.addressUser?.shipName, order.addressUser?.shipAdress].some(value => value?.toLowerCase().includes(search)));
    const error = errors[tab];

    return <main className="container order-workflow">
        <div className="order-heading"><h1 className="h3">Công việc giao hàng</h1><button className="btn btn-outline-success" type="button" onClick={() => loadOrders({ fresh: true })} disabled={refreshing || Boolean(busyId)}>Làm mới</button></div>
        <p>Nhận đơn đã được cửa hàng xác nhận, giao cho khách và theo dõi đánh giá sau giao hàng.</p>
        <div className="shipping-summary"><div><strong>{summary?.working ?? '…'}</strong>Đơn đang giao</div><div><strong>{summary?.done ?? '…'}</strong>Đơn đã giao</div><div><strong>{summary ? Number(summary.ratingCount) ? `${Number(summary.ratingAverage).toFixed(1)}/5` : 'Chưa có' : '…'}</strong>{summary ? `${summary.ratingCount} đánh giá từ khách hàng` : 'Đang tải đánh giá'}</div></div>
        <div role="tablist" className="shipping-tabs" aria-label="Danh sách giao hàng">{Object.entries(tabs).map(([value, label]) => <button type="button" role="tab" id={`shipping-tab-${value}`} aria-controls="shipping-orders" aria-selected={tab === value} key={value} className="btn btn-outline-success" onClick={() => changeTab(value)}>{label}{value === 'available' && loaded.available ? ` (${data.available.length})` : ''}</button>)}</div>
        <div className="order-filters"><label>Tìm đơn giao hàng<input type="search" value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="Mã đơn, người nhận, địa chỉ" /></label></div>
        <p className="order-refresh-status" role="status" aria-live="polite">{loading[tab] ? loaded[tab] ? 'Đang cập nhật đơn giao hàng…' : 'Đang tải đơn giao hàng…' : ''}</p>
        {error && <div role="alert" className="order-status-message"><p>{error}</p>{loaded[tab] && <p>Đang hiển thị dữ liệu lần tải gần nhất.</p>}<button type="button" className="btn btn-outline-success" onClick={() => loadOrders({ fresh: true })}>Thử lại</button></div>}
        {actionError && <p role="alert" className="text-danger">{actionError}</p>}
        <div role="tabpanel" id="shipping-orders" aria-labelledby={`shipping-tab-${tab}`} aria-busy={loading[tab]}>
            {loaded[tab] && !loading[tab] && !error && !orders.length && <p className="order-status-message">{search ? 'Không có đơn giao hàng phù hợp.' : tab === 'available' ? 'Chưa có đơn hàng chờ nhận. Đơn sẽ xuất hiện sau khi cửa hàng xác nhận.' : tab === 'working' ? 'Bạn chưa có đơn đang giao. Chọn “Đơn chờ nhận” để nhận đơn.' : 'Bạn chưa hoàn thành đơn giao hàng nào.'}</p>}
            {orders.map(order => <article className="order-card" key={order.id} aria-label={`Đơn giao hàng ${order.id}`}>
                <div className="order-heading"><h2>Đơn hàng #{order.id}</h2><span>{ORDER_STATUSES[order.statusId] || tabs[tab]}</span></div>
                <p><strong>{order.addressUser?.shipName || 'Người nhận'}</strong>{order.addressUser?.shipPhonenumber && <> · <a href={`tel:${order.addressUser.shipPhonenumber}`}>{order.addressUser.shipPhonenumber}</a></>}</p>
                <p>{order.addressUser?.shipAdress || 'Chưa có địa chỉ'}</p>
                <p>Tiền cần thu: <strong>{formatOrderMoney(Number(order.isPaymentOnlien) === 1 || ['S6', 'S9', 'S10'].includes(order.statusId) ? 0 : orderTotals(order).totalPrice)}</strong> · {paymentLabel(order)}</p>
                {order.deliveredAt && <p>Giao thành công: {formatOrderDate(order.deliveredAt)}</p>}
                <div className="order-actions"><button type="button" className="btn btn-outline-secondary" aria-expanded={expanded === order.id} onClick={() => setExpanded(expanded === order.id ? null : order.id)}>{expanded === order.id ? 'Thu gọn' : 'Xem chi tiết'}</button>
                    {tab === 'available' && order.statusId === 'S4' && !order.shipperId && <button type="button" className="btn btn-success" disabled={Boolean(busyId)} onClick={() => setClaiming(order.id)}>Nhận giao đơn</button>}
                    {tab === 'working' && order.statusId === 'S5' && String(order.shipperId) === String(userId) && <button type="button" className="btn btn-success" disabled={Boolean(busyId)} onClick={() => setCompleting(order.id)}>Xác nhận giao hàng</button>}
                </div>
                {expanded === order.id && <OrderDetails order={order} compact />}
                {claiming === order.id && <div className="order-action-form"><p>Nhận giao đơn #{order.id} đến {order.addressUser?.shipAdress}?</p><div className="order-actions"><button type="button" className="btn btn-success" disabled={Boolean(busyId)} onClick={() => perform(order, () => assignShippingOrder(order.id), 'Đã nhận giao đơn hàng.', 'working')}>{busyId === order.id ? 'Đang nhận…' : 'Xác nhận nhận đơn'}</button><button type="button" className="btn btn-outline-secondary" disabled={Boolean(busyId)} onClick={() => setClaiming(null)}>Quay lại</button></div></div>}
                {completing === order.id && <DeliveryForm order={order} busy={busyId === order.id} onClose={() => setCompleting(null)} onSubmit={image => perform(order, () => completeShippingOrder(order.id, image), 'Đã giao hàng thành công.', 'done')} />}
                {tab === 'working' && String(order.shipperId) === String(userId) && <DeliveryExceptions key={`exceptions-${order.id}`} order={order} onUpdated={exceptionUpdated} disabled={Boolean(busyId)} onActionStart={() => startException(order.id)} onActionEnd={finishException} />}
                {tab === 'done' && <ShipperRating order={order} />}
            </article>)}
        </div>
    </main>;
}
