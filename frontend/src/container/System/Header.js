import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearAuth, getUser } from '../../utils/token';
import NotificationsBell from '../../component/Notifications/NotificationsBell';
import { ADMIN_NAV_GROUPS } from './SideBar';

export default function Header({ navigationOpen = false, onToggleNavigation = () => {} }) {
    const user = getUser();
    const location = useLocation();
    const navigate = useNavigate();
    const [accountOpen, setAccountOpen] = useState(false);
    const [keyword, setKeyword] = useState('');
    const accountRef = useRef(null);
    useEffect(() => { setAccountOpen(false); }, [location.pathname, location.search]);
    useEffect(() => {
        if (!accountOpen) return undefined;
        const closeOutside = event => { if (!accountRef.current?.contains(event.target)) setAccountOpen(false); };
        const closeEscape = event => { if (event.key === 'Escape') setAccountOpen(false); };
        document.addEventListener('pointerdown', closeOutside); document.addEventListener('keydown', closeEscape);
        return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape); };
    }, [accountOpen]);
    const path = location.pathname.replace('/system/home/', '');
    const currentLink = ADMIN_NAV_GROUPS.flatMap(group => group.links).find(link => link.path === path);
    const pageTitle = location.pathname === '/system/home' || location.pathname === '/system/home/' ? 'Tổng quan vận hành' : currentLink?.label || (path.startsWith('order-detail') ? 'Chi tiết đơn hàng' : path.startsWith('infor') ? 'Thông tin cá nhân' : path.startsWith('change-password') ? 'Đổi mật khẩu' : 'Quản lý cửa hàng');
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Tài khoản';
    const initials = fullName.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();
    const search = event => {
        event.preventDefault();
        const value = keyword.trim();
        navigate(`/system/home/list-order${value ? `?keyword=${encodeURIComponent(value)}` : ''}`);
    };
    return <header className="admin-header">
        <div className="admin-header-context"><button type="button" className="admin-menu-toggle" aria-label={navigationOpen ? 'Đóng menu quản trị' : 'Mở menu quản trị'} aria-expanded={navigationOpen} aria-controls="admin-navigation" onClick={onToggleNavigation}><i className="fas fa-bars" aria-hidden="true" /></button><div className="admin-header-title"><span>Quản trị cửa hàng</span><strong>{pageTitle}</strong></div></div>
        <form className="admin-global-search" role="search" onSubmit={search}><i className="fas fa-search" aria-hidden="true" /><input type="search" aria-label="Tìm đơn hàng từ menu quản trị" placeholder="Tìm đơn hàng…" value={keyword} maxLength={100} onChange={event => setKeyword(event.target.value)} /><button type="submit" aria-label="Tìm đơn hàng">Tìm</button></form>
        <div className="admin-header-actions"><Link className="admin-store-link" to="/"><i className="fas fa-external-link-alt" aria-hidden="true" /><span>Xem cửa hàng</span></Link>{user?.id && <NotificationsBell />}
            <div className="admin-account" ref={accountRef}><button className="admin-account-toggle" type="button" aria-label="Tài khoản quản trị" aria-expanded={accountOpen} aria-controls="admin-account-menu" onClick={() => setAccountOpen(open => !open)}><span className="admin-avatar" aria-hidden="true">{initials}</span><span className="admin-account-name"><strong>{fullName}</strong><small>{user?.roleId === 'R1' ? 'Chủ cửa hàng' : 'Nhân viên'}</small></span><i className="fas fa-chevron-down" aria-hidden="true" /></button>
                {accountOpen && <div className="admin-account-menu" id="admin-account-menu"><p>{fullName}</p><Link to={`/system/home/infor/${user?.id}`}>Thông tin cá nhân</Link><Link to={`/system/home/change-password/${user?.id}`}>Đổi mật khẩu</Link><button type="button" onClick={() => { clearAuth(); window.location.href = '/login'; }}>Đăng xuất</button></div>}
            </div>
        </div>
    </header>;
}
