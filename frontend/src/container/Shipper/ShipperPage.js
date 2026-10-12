import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { assignShippingOrder, completeShippingOrder, getAvailableShippingOrders, getShipperOrders } from '../../services/shippingService';
import OrderDetails from '../../component/Order/OrderDetails';
import { ShipperRating } from '../../component/Order/OrderForms';
import { formatOrderDate, formatOrderMoney, orderTotals } from '../../utils/orders';
import { getUser } from '../../utils/token';
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
    const [summary, setSummary] = useState({ working: 0, done: 0, ratingCount: 0, ratingAverage: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [busyId, setBusyId] = useState(null);
    const [claiming, setClaiming] = useState(null);
    const [completing, setCompleting] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const [keyword, setKeyword] = useState('');
    const request = useRef(0);

    const loadOrders = useCallback(async () => {
        const current = ++request.current;
        setLoading(true); setError('');
        try {
            const responses = await Promise.all([getAvailableShippingOrders(), getShipperOrders('working'), getShipperOrders('done')]);
            const failure = responses.find(response => response?.errCode !== 0);
            if (failure) throw new Error(failure.errMessage || 'Không thể tải đơn giao hàng.');
            if (current === request.current) {
                setData({ available: responses[0].data || [], working: responses[1].data || [], done: responses[2].data || [] });
                setSummary(responses[1].summary || { working: responses[1].data?.length || 0, done: responses[2].data?.length || 0, ratingCount: 0, ratingAverage: 0 });
            }
        } catch (failure) { if (current === request.current) setError(failure.message); }
        finally { if (current === request.current) setLoading(false); }
    }, []);
    useEffect(() => { const requests = request; loadOrders(); return () => { requests.current += 1; }; }, [loadOrders]);

    const perform = async (order, operation, message, nextTab) => {
        if (busyId) return;
        setBusyId(order.id); setActionError('');
        try {
            const response = await operation();
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể cập nhật giao hàng.');
            toast.success(message); setClaiming(null); setCompleting(null);
            await loadOrders(); setTab(nextTab); setKeyword('');
        } catch (failure) { setActionError(failure.message); }
        finally { setBusyId(null); }
    };
    const changeTab = (value) => { setTab(value); setExpanded(null); setClaiming(null); setCompleting(null); setKeyword(''); setActionError(''); };
    const search = keyword.trim().toLowerCase();
    const orders = data[tab].filter(order => !search || String(order.id).includes(search) || [order.addressUser?.shipName, order.addressUser?.shipAdress].some(value => value?.toLowerCase().includes(search)));

    return <main className="container order-workflow">
        <div className="order-heading"><h1 className="h3">Công việc giao hàng</h1><button className="btn btn-outline-success" type="button" onClick={loadOrders} disabled={loading || Boolean(busyId)}>Làm mới</button></div>
        <p>Nhận đơn đã được cửa hàng xác nhận, giao cho khách và theo dõi đánh giá sau giao hàng.</p>
        <div className="shipping-summary"><div><strong>{summary.working}</strong>Đơn đang giao</div><div><strong>{summary.done}</strong>Đơn đã giao</div><div><strong>{Number(summary.ratingCount) ? `${Number(summary.ratingAverage).toFixed(1)}/5` : 'Chưa có'}</strong>{summary.ratingCount} đánh giá từ khách hàng</div></div>
        <div role="tablist" className="shipping-tabs" aria-label="Danh sách giao hàng">{Object.entries(tabs).map(([value, label]) => <button type="button" role="tab" id={`shipping-tab-${value}`} aria-controls="shipping-orders" aria-selected={tab === value} key={value} className="btn btn-outline-success" onClick={() => changeTab(value)}>{label}{value === 'available' && !loading ? ` (${data.available.length})` : ''}</button>)}</div>
        <div className="order-filters"><label>Tìm đơn giao hàng<input type="search" value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="Mã đơn, người nhận, địa chỉ" /></label></div>
        {loading && <p role="status" className="order-status-message">Đang tải đơn giao hàng…</p>}
        {error && <div role="alert" className="order-status-message"><p>{error}</p><button type="button" className="btn btn-outline-success" onClick={loadOrders}>Thử lại</button></div>}
        {actionError && <p role="alert" className="text-danger">{actionError}</p>}
        <div role="tabpanel" id="shipping-orders" aria-labelledby={`shipping-tab-${tab}`}>
            {!loading && !error && !orders.length && <p className="order-status-message">{search ? 'Không có đơn giao hàng phù hợp.' : tab === 'available' ? 'Chưa có đơn hàng chờ nhận. Đơn sẽ xuất hiện sau khi cửa hàng xác nhận.' : tab === 'working' ? 'Bạn chưa có đơn đang giao. Chọn “Đơn chờ nhận” để nhận đơn.' : 'Bạn chưa hoàn thành đơn giao hàng nào.'}</p>}
            {!loading && !error && orders.map(order => <article className="order-card" key={order.id} aria-label={`Đơn giao hàng ${order.id}`}>
                <div className="order-heading"><h2>Đơn hàng #{order.id}</h2><span>{tabs[tab]}</span></div>
                <p><strong>{order.addressUser?.shipName || 'Người nhận'}</strong>{order.addressUser?.shipPhonenumber && <> · <a href={`tel:${order.addressUser.shipPhonenumber}`}>{order.addressUser.shipPhonenumber}</a></>}</p>
                <p>{order.addressUser?.shipAdress || 'Chưa có địa chỉ'}</p>
                <p>Tiền cần thu: <strong>{formatOrderMoney(Number(order.isPaymentOnlien) === 1 ? 0 : orderTotals(order).totalPrice)}</strong>{Number(order.isPaymentOnlien) === 1 && ' · Đã thanh toán trực tuyến'}</p>
                {order.deliveredAt && <p>Giao thành công: {formatOrderDate(order.deliveredAt)}</p>}
                <div className="order-actions"><button type="button" className="btn btn-outline-secondary" aria-expanded={expanded === order.id} onClick={() => setExpanded(expanded === order.id ? null : order.id)}>{expanded === order.id ? 'Thu gọn' : 'Xem chi tiết'}</button>
                    {tab === 'available' && order.statusId === 'S4' && !order.shipperId && <button type="button" className="btn btn-success" disabled={Boolean(busyId)} onClick={() => setClaiming(order.id)}>Nhận giao đơn</button>}
                    {tab === 'working' && order.statusId === 'S5' && String(order.shipperId) === String(userId) && <button type="button" className="btn btn-success" disabled={Boolean(busyId)} onClick={() => setCompleting(order.id)}>Xác nhận giao hàng</button>}
                </div>
                {expanded === order.id && <OrderDetails order={order} compact />}
                {claiming === order.id && <div className="order-action-form"><p>Nhận giao đơn #{order.id} đến {order.addressUser?.shipAdress}?</p><div className="order-actions"><button type="button" className="btn btn-success" disabled={Boolean(busyId)} onClick={() => perform(order, () => assignShippingOrder(order.id), 'Đã nhận giao đơn hàng.', 'working')}>{busyId === order.id ? 'Đang nhận…' : 'Xác nhận nhận đơn'}</button><button type="button" className="btn btn-outline-secondary" disabled={Boolean(busyId)} onClick={() => setClaiming(null)}>Quay lại</button></div></div>}
                {completing === order.id && <DeliveryForm order={order} busy={busyId === order.id} onClose={() => setCompleting(null)} onSubmit={image => perform(order, () => completeShippingOrder(order.id, image), 'Đã giao hàng thành công.', 'done')} />}
                {tab === 'done' && <ShipperRating order={order} />}
            </article>)}
        </div>
    </main>;
}
