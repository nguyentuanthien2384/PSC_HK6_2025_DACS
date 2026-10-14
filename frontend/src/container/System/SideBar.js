import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { getUser } from '../../utils/token';

export const ADMIN_NAV_GROUPS = [
    { id: 'operations', title: 'Vận hành', icon: 'fas fa-shopping-bag', links: [
        { path: 'list-order', label: 'Đơn hàng', icon: 'fas fa-box' },
        { path: 'returns', label: 'Trả hàng & hoàn tiền', icon: 'fas fa-undo-alt' },
        { path: 'payment-reconciliation', label: 'Đối soát thanh toán', icon: 'fas fa-credit-card' },
        { path: 'chat', label: 'Hỗ trợ khách hàng', icon: 'far fa-comments' },
    ] },
    { id: 'inventory', title: 'Kho & nhập hàng', icon: 'fas fa-warehouse', links: [
        { path: 'inventory', label: 'Kiểm kê tồn kho', icon: 'fas fa-clipboard-check' },
        { path: 'stock-product', label: 'Báo cáo tồn kho', icon: 'fas fa-cubes' },
        { path: 'list-receipt', label: 'Phiếu nhập hàng', icon: 'fas fa-file-import' },
        { path: 'list-supplier', label: 'Nhà cung cấp', icon: 'fas fa-truck-loading' },
    ] },
    { id: 'catalog', title: 'Sản phẩm', ownerOnly: true, icon: 'fas fa-tags', links: [
        { path: 'list-product', label: 'Danh sách sản phẩm', icon: 'fas fa-tshirt' },
        { path: 'list-category', label: 'Danh mục', icon: 'fas fa-list' },
        { path: 'list-brand', label: 'Thương hiệu', icon: 'far fa-copyright' },
    ] },
    { id: 'marketing', title: 'Khuyến mãi & nội dung', ownerOnly: true, icon: 'fas fa-bullhorn', links: [
        { path: 'list-voucher', label: 'Mã khuyến mãi', icon: 'fas fa-ticket-alt' },
        { path: 'list-typevoucher', label: 'Loại khuyến mãi', icon: 'fas fa-percentage' },
        { path: 'list-banner', label: 'Banner cửa hàng', icon: 'far fa-image' },
        { path: 'list-blog', label: 'Bài viết', icon: 'fas fa-feather-alt' },
        { path: 'list-subject', label: 'Chủ đề bài viết', icon: 'fas fa-bookmark' },
    ] },
    { id: 'reports', title: 'Báo cáo tài chính', ownerOnly: true, icon: 'fas fa-chart-line', links: [
        { path: 'turnover', label: 'Doanh thu', icon: 'fas fa-chart-bar' },
        { path: 'profit', label: 'Lợi nhuận', icon: 'fas fa-coins' },
        { path: 'statistics', label: 'Thống kê chi tiết', icon: 'fas fa-chart-pie' },
    ] },
    { id: 'settings', title: 'Quản trị cửa hàng', ownerOnly: true, icon: 'fas fa-cog', links: [
        { path: 'list-user', label: 'Tài khoản & phân quyền', icon: 'fas fa-users' },
        { path: 'audit', label: 'Nhật ký thao tác', icon: 'fas fa-history' },
        { path: 'list-typeship', label: 'Phí giao hàng', icon: 'fas fa-shipping-fast' },
    ] },
];

const DETAIL_PAGES = {
    'order-detail': ['list-order', 'Chi tiết đơn hàng'],
    'add-receipt': ['list-receipt', 'Tạo phiếu nhập hàng'],
    'detail-receipt': ['list-receipt', 'Chi tiết phiếu nhập hàng'],
    'add-supplier': ['list-supplier', 'Thêm nhà cung cấp'],
    'edit-supplier': ['list-supplier', 'Chỉnh sửa nhà cung cấp'],
    'add-user': ['list-user', 'Thêm tài khoản'],
    'edit-user': ['list-user', 'Chỉnh sửa tài khoản'],
    'add-product': ['list-product', 'Thêm sản phẩm'],
    'edit-product': ['list-product', 'Chỉnh sửa sản phẩm'],
    'list-product-detail': ['list-product', 'Biến thể sản phẩm'],
    'list-product-detail-image': ['list-product', 'Ảnh và kích thước sản phẩm'],
    'add-product-detail': ['list-product', 'Thêm biến thể sản phẩm'],
    'update-product-detail': ['list-product', 'Chỉnh sửa biến thể sản phẩm'],
    'infor': [null, 'Thông tin cá nhân'],
    'change-password': [null, 'Đổi mật khẩu'],
    'notifications': [null, 'Thông báo'],
};

export function getAdminRouteContext(pathname) {
    const segment = pathname.replace(/^\/system\/home\/?/i, '').split('/')[0].toLowerCase();
    const detail = DETAIL_PAGES[segment];
    const parent = detail ? detail[0] : segment.replace(/^(?:add|edit)-/, 'list-');
    const currentLink = ADMIN_NAV_GROUPS.flatMap(group => group.links).find(link => link.path === parent);
    const group = currentLink ? ADMIN_NAV_GROUPS.find(item => item.links.includes(currentLink)) : undefined;
    const title = !segment ? 'Tổng quan vận hành' : detail?.[1] || (currentLink ? `${/^(?:add|edit)-/.test(segment) ? (segment.startsWith('add-') ? 'Thêm mới · ' : 'Chỉnh sửa · ') : ''}${currentLink.label}` : 'Quản lý cửa hàng');
    return { currentLink, group, title };
}

export default function SideBar({ onNavigate = () => {}, mobileNavigation = false, navigationOpen = false }) {
    const user = getUser();
    const location = useLocation();
    const { currentLink, group: activeGroup } = getAdminRouteContext(location.pathname);
    const [expanded, setExpanded] = useState({ operations: true, inventory: true, catalog: true });
    useEffect(() => {
        if (activeGroup) setExpanded(current => ({ ...current, [activeGroup.id]: true }));
    }, [activeGroup]);
    return <aside className="admin-sidebar" id="admin-navigation" aria-label="Menu quản trị" aria-hidden={mobileNavigation && !navigationOpen ? true : undefined} inert={mobileNavigation && !navigationOpen ? true : undefined}>
        <Link to="/system/home" className="admin-brand" onClick={onNavigate}>
            <span className="admin-brand-mark" aria-hidden="true">D</span><span><strong>DACS</strong><small>Quản trị cửa hàng</small></span>
        </Link>
        <button type="button" className="admin-sidebar-close" aria-label="Đóng thanh điều hướng" onClick={onNavigate}><i className="fas fa-times" aria-hidden="true" /></button>
        <nav className="admin-sidebar-navigation" aria-label="Các chức năng quản trị">
            <NavLink end to="/system/home" className={({ isActive }) => `admin-nav-link admin-nav-dashboard${isActive ? ' active' : ''}`} onClick={onNavigate}><i className="fas fa-th-large" aria-hidden="true" /><span>Tổng quan vận hành</span></NavLink>
            {ADMIN_NAV_GROUPS.filter(group => !group.ownerOnly || user?.roleId === 'R1').map(group => <div className="admin-nav-group" key={group.id}>
                <button type="button" className="admin-nav-group-toggle" aria-expanded={!!expanded[group.id]} aria-controls={`admin-nav-${group.id}`} onClick={() => setExpanded(current => ({ ...current, [group.id]: !current[group.id] }))}>
                    <span><i className={group.icon} aria-hidden="true" />{group.title}</span><i className={`fas fa-chevron-${expanded[group.id] ? 'up' : 'down'}`} aria-hidden="true" />
                </button>
                <div id={`admin-nav-${group.id}`} hidden={!expanded[group.id]}>{group.links.map(link => <Link key={link.path} to={`/system/home/${link.path}`} aria-current={currentLink?.path === link.path ? 'page' : undefined} className={`admin-nav-link${currentLink?.path === link.path ? ' active' : ''}`} onClick={onNavigate}><i className={link.icon} aria-hidden="true" /><span>{link.label}</span></Link>)}</div>
            </div>)}
        </nav>
        <div className="admin-sidebar-footer"><span className="admin-role-dot" aria-hidden="true" /><div><strong>{user?.roleId === 'R1' ? 'Chủ cửa hàng' : 'Nhân viên vận hành'}</strong><small>{user?.firstName || user?.lastName ? [user.firstName, user.lastName].filter(Boolean).join(' ') : 'Tài khoản quản trị'}</small></div></div>
    </aside>;
}
