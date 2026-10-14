import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getNotifications, readNotification, readAllNotifications, notifyNotificationsChanged } from '../../services/notificationService';
import { notificationDestination } from '../../utils/notifications';
import { formatOrderDate } from '../../utils/orders';
import './Notifications.scss';

const previewLimit = 6;

export default function NotificationsBell({ allHref = '/notifications' }) {
    const [count, setCount] = useState(0);
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [badgeError, setBadgeError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');
    const rootRef = useRef(null), triggerRef = useRef(null);
    const sequence = useRef(0), controllerRef = useRef(null), mounted = useRef(false);
    const openRef = useRef(false), actionPending = useRef(false);
    const { pathname, search } = useLocation();
    const panelId = useId();

    const load = useCallback(async () => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        const ticket = ++sequence.current;
        const panel = openRef.current;
        if (panel) { setLoading(true); setError(''); }
        try {
            const response = await getNotifications({ limit: panel ? previewLimit : 1, offset: 0, signal: controller.signal });
            if (controller.signal.aborted || ticket !== sequence.current || !mounted.current) return;
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải thông báo.');
            setCount(Math.max(0, Number(response.unreadCount) || 0));
            setBadgeError(false);
            if (panel) setItems(Array.isArray(response.data) ? response.data : []);
        } catch (failure) {
            if (controller.signal.aborted || ticket !== sequence.current || !mounted.current) return;
            setBadgeError(true);
            if (panel) setError(failure.message || 'Không thể tải thông báo.');
        } finally {
            if (!controller.signal.aborted && ticket === sequence.current && mounted.current) setLoading(false);
        }
    }, []);

    const close = useCallback((restoreFocus = false) => {
        openRef.current = false;
        setOpen(false);
        sequence.current += 1;
        controllerRef.current?.abort();
        setLoading(false);
        if (restoreFocus) triggerRef.current?.focus();
    }, []);

    useEffect(() => { if (openRef.current) close(); }, [pathname, search, close]);
    useEffect(() => {
        mounted.current = true;
        load();
        const refresh = () => { if (!actionPending.current && document.visibilityState !== 'hidden') load(); };
        const interval = setInterval(refresh, 30000);
        window.addEventListener('focus', refresh);
        window.addEventListener('notifications-changed', refresh);
        return () => {
            mounted.current = false;
            sequence.current += 1;
            controllerRef.current?.abort();
            clearInterval(interval);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('notifications-changed', refresh);
        };
    }, [load]);
    useEffect(() => {
        if (!open) return undefined;
        const outside = event => { if (!rootRef.current?.contains(event.target)) close(); };
        const escape = event => { if (event.key === 'Escape') { event.preventDefault(); close(true); } };
        const focusOutside = event => { if (!rootRef.current?.contains(event.target)) close(); };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape);
        document.addEventListener('focusin', focusOutside);
        return () => {
            document.removeEventListener('pointerdown', outside);
            document.removeEventListener('keydown', escape);
            document.removeEventListener('focusin', focusOutside);
        };
    }, [open, close]);

    const toggle = () => {
        if (openRef.current) { close(); return; }
        openRef.current = true;
        setOpen(true);
        setItems([]);
        setActionError('');
        load();
    };
    const markRead = async id => {
        if (actionPending.current) return;
        actionPending.current = true;
        sequence.current += 1;
        controllerRef.current?.abort();
        setBusy(true);
        setActionError('');
        try {
            const response = await (id == null ? readAllNotifications() : readNotification(id));
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể đánh dấu đã đọc.');
            notifyNotificationsChanged();
            if (mounted.current) await load();
        } catch (failure) {
            if (mounted.current) { setActionError(failure.message || 'Không thể đánh dấu đã đọc.'); setLoading(false); }
        } finally {
            actionPending.current = false;
            if (mounted.current) setBusy(false);
        }
    };

    return <div className="notifications-bell" ref={rootRef}>
        <button ref={triggerRef} type="button" className="icons notifications-trigger" aria-label={`Thông báo${count ? `, ${count} chưa đọc` : ''}`} aria-expanded={open} aria-controls={panelId} onClick={toggle}>
            <span className="notifications-icon" aria-hidden="true"><i className="fas fa-bell" />{count > 0 && <span className="notifications-count">{count > 99 ? '99+' : count}</span>}</span>
            {badgeError && <span className="notifications-error-dot" aria-hidden="true">!</span>}
        </button>
        {open && <section className="notifications-dropdown" id={panelId} aria-label="Bảng thông báo">
            <header className="notifications-dropdown__header"><div><h2>Thông báo</h2><p>{count} chưa đọc</p></div><button type="button" aria-label="Đóng bảng thông báo" className="notifications-dropdown__close" onClick={() => close(true)}>×</button></header>
            <div className="notifications-dropdown__tools"><span>Mới nhất</span><button type="button" disabled={busy || loading || !count} onClick={() => markRead(null)}>{busy ? 'Đang cập nhật…' : 'Đánh dấu tất cả đã đọc'}</button></div>
            {actionError && <p role="alert" className="notifications-dropdown__error">{actionError}</p>}
            <div className="notifications-dropdown__list" aria-busy={loading}>
                {loading && <p role="status" className="notifications-dropdown__state">Đang tải thông báo…</p>}
                {error && <div role="alert" className="notifications-dropdown__state"><p>{error}</p><button type="button" onClick={load}>Thử lại</button></div>}
                {!loading && !error && !items.length && <p className="notifications-dropdown__state">Chưa có thông báo mới.</p>}
                {!error && items.map(item => <article key={item.id} className={`notifications-dropdown__item${item.readAt ? '' : ' is-unread'}`} aria-label={`Thông báo ${item.id}`}>
                    <span className="notifications-dropdown__unread" aria-hidden="true" />
                    <div><h3>{notificationDestination(item) ? <Link to={notificationDestination(item)} onClick={() => close()}>{item.title}</Link> : item.title}</h3><p>{item.message}</p><time dateTime={item.createdAt}>{formatOrderDate(item.createdAt)}</time>
                        {!item.readAt && <button type="button" className="notifications-dropdown__read" disabled={busy || loading} aria-label={`Đánh dấu đã đọc: ${item.title}`} onClick={() => markRead(item.id)}>Đánh dấu đã đọc</button>}
                    </div>
                </article>)}
            </div>
            <footer className="notifications-dropdown__footer"><Link to={allHref} onClick={() => close()}>Xem tất cả thông báo <span aria-hidden="true">→</span></Link></footer>
        </section>}
    </div>;
}
