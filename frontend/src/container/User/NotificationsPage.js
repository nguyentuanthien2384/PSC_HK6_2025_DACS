import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNotifications, readNotification, readAllNotifications, notifyNotificationsChanged } from '../../services/notificationService';
import { formatOrderDate } from '../../utils/orders';
import '../../component/Notifications/Notifications.scss';
import '../../component/Order/OrderWorkflow.scss';

export function notificationDestination(notification) {
    const link = notification.link;
    return typeof link === 'string' && /^\/(?:user\/|shipper(?:\?|$)|system\/home\/)/.test(link) && !/[\\\r\n]/.test(link) ? link : null;
}

export default function NotificationsPage() {
    const [items, setItems] = useState([]);
    const [count, setCount] = useState(0);
    const [unreadCount, setUnreadCount] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const sequence = useRef(0);
    const load = useCallback(async (background = false) => {
        const ticket = ++sequence.current;
        if (!background) setLoading(true);
        setError('');
        try {
            const response = await getNotifications({ limit: 20, offset: page * 20 });
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải thông báo.');
            if (ticket === sequence.current) { setItems(response.data || []); setCount(Number(response.count) || 0); setUnreadCount(Number(response.unreadCount) || 0); }
        } catch (failure) { if (ticket === sequence.current) setError(failure.message); }
        finally { if (ticket === sequence.current) setLoading(false); }
    }, [page]);
    useEffect(() => {
        const requests = sequence;
        load();
        const focus = () => load(true);
        const interval = setInterval(() => { if (document.visibilityState !== 'hidden') load(true); }, 30000);
        window.addEventListener('focus', focus);
        return () => { requests.current += 1; clearInterval(interval); window.removeEventListener('focus', focus); };
    }, [load]);
    const markRead = async id => {
        if (busy) return;
        setBusy(true); setActionError('');
        try {
            const response = await (id == null ? readAllNotifications() : readNotification(id));
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể đánh dấu đã đọc.');
            notifyNotificationsChanged(); await load(true);
        } catch (failure) { setActionError(failure.message); }
        finally { setBusy(false); }
    };
    return <main className="container order-workflow notifications-page">
        <div className="order-heading"><h1 className="h3">Thông báo của tôi</h1><button type="button" className="btn btn-outline-success" disabled={busy || loading || !unreadCount} onClick={() => markRead(null)}>{busy ? 'Đang cập nhật…' : 'Đánh dấu tất cả đã đọc'}</button></div>
        <p>{unreadCount} thông báo chưa đọc</p>
        {loading && <p role="status">Đang tải thông báo…</p>}
        {error && <div role="alert"><p>{error}</p><button type="button" className="btn btn-outline-secondary" onClick={() => load()}>Thử lại</button></div>}
        {actionError && <p role="alert" className="text-danger">{actionError}</p>}
        {!loading && !error && !items.length && <p className="order-status-message">Chưa có thông báo. Các thay đổi đơn hàng, vận chuyển và hoàn tiền sẽ xuất hiện tại đây.</p>}
        {!loading && !error && items.map(item => <article key={item.id} className={`order-card notification-item ${item.readAt ? '' : 'unread'}`} aria-label={`Thông báo ${item.id}`}>
            <div className="order-heading"><h2>{item.title}</h2>{!item.readAt && <span>Chưa đọc</span>}</div><p>{item.message}</p><time>{formatOrderDate(item.createdAt)}</time>
            <div className="order-actions">{notificationDestination(item) && <Link className="btn btn-outline-success" to={notificationDestination(item)}>Xem chi tiết</Link>}{!item.readAt && <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => markRead(item.id)}>Đánh dấu đã đọc</button>}</div>
        </article>)}
        {count > 20 && <nav className="order-actions" aria-label="Phân trang thông báo"><button className="btn btn-outline-secondary" type="button" disabled={page === 0 || loading || busy} onClick={() => setPage(page - 1)}>Trang trước</button><span>Trang {page + 1} / {Math.ceil(count / 20)}</span><button className="btn btn-outline-secondary" type="button" disabled={(page + 1) * 20 >= count || loading || busy} onClick={() => setPage(page + 1)}>Trang sau</button></nav>}
    </main>;
}
