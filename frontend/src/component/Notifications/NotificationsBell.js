import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNotifications } from '../../services/notificationService';
import './Notifications.scss';

export default function NotificationsBell() {
    const [count, setCount] = useState(0);
    const [error, setError] = useState(false);
    const sequence = useRef(0);
    const load = useCallback(async () => {
        const ticket = ++sequence.current;
        try {
            const response = await getNotifications({ limit: 1, offset: 0 });
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải thông báo');
            if (ticket === sequence.current) { setCount(Number(response.unreadCount) || 0); setError(false); }
        } catch { if (ticket === sequence.current) setError(true); }
    }, []);
    useEffect(() => {
        const requests = sequence;
        load();
        const refresh = () => { if (document.visibilityState !== 'hidden') load(); };
        const interval = setInterval(refresh, 30000);
        window.addEventListener('focus', refresh); window.addEventListener('notifications-changed', refresh);
        return () => { requests.current += 1; clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('notifications-changed', refresh); };
    }, [load]);
    return <span className="notifications-bell">
        <Link to="/notifications" className="icons" aria-label={`Thông báo${count ? `, ${count} chưa đọc` : ''}`}>
            <span className="notifications-icon" aria-hidden="true">
                <i className="fas fa-bell" />
                {count > 0 && <span className="notifications-count">{count > 99 ? '99+' : count}</span>}
            </span>
        </Link>
        {error && <button type="button" className="notifications-retry" onClick={load} title="Không thể tải thông báo. Thử lại." aria-label="Thử tải lại số thông báo">!</button>}
    </span>;
}
