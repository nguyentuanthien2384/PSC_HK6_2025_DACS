import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { setAuth } from '../../utils/token';
import HomePageAdmin, { AdminLayout, OwnerRoute } from './HomePageAdmin';
import SideBar from './SideBar';

// CRA's Jest resolver predates package exports; use the installed router's CJS entry.
jest.mock('react-router-dom', () => {
    global.TextEncoder = require('util').TextEncoder;
    return jest.requireActual('../../../node_modules/react-router/dist/development/index.js');
}, { virtual: true });
jest.mock('../../component/Notifications/NotificationsBell', () => () => <span>Thông báo kiểm thử</span>);
jest.mock('./Operations/OperationsDashboard', () => () => <h1>Dashboard đã tải</h1>);
jest.mock('./Operations/OperationsOrders', () => () => <h1>Danh sách đơn đã tải</h1>);
jest.mock('./Inventory/InventoryManagement', () => () => <h1>Kho đã tải</h1>);

function LocationProbe() {
    const location = useLocation();
    return <output aria-label="Đường dẫn kiểm thử">{location.pathname}{location.search}</output>;
}
function login(roleId = 'R1') {
    setAuth('fixture-token', { id: 34, roleId, firstName: 'Quản', lastName: 'Trị' });
}
beforeEach(() => { localStorage.clear(); login(); });

test('staff navigation contains operational tools and excludes owner settings', () => {
    login('R4');
    render(<MemoryRouter initialEntries={['/system/home/inventory']}><SideBar /></MemoryRouter>);
    const menu = screen.getByRole('navigation', { name: 'Các chức năng quản trị' });
    expect(within(menu).getByRole('link', { name: 'Đơn hàng' })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Kiểm kê tồn kho' })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('link', { name: 'Đối soát thanh toán' })).toBeInTheDocument();
    expect(within(menu).queryByText('Tài khoản & phân quyền')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Nhật ký thao tác')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Doanh thu')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Danh sách sản phẩm')).not.toBeInTheDocument();
});

test('owner navigation opens the section containing the active deep link', () => {
    render(<MemoryRouter initialEntries={['/system/home/audit']}><SideBar /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Quản trị cửa hàng' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Nhật ký thao tác' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Quản trị cửa hàng' }));
    expect(screen.queryByRole('link', { name: 'Nhật ký thao tác' })).not.toBeInTheDocument();
});

test('owner guard prevents rendering protected content for staff', () => {
    login('R4');
    const protectedRender = jest.fn();
    const SensitivePage = () => { protectedRender(); return <h1>Nội dung tài chính</h1>; };
    render(<MemoryRouter><OwnerRoute><SensitivePage /></OwnerRoute></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Trang dành cho chủ cửa hàng' })).toBeInTheDocument();
    expect(protectedRender).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Về trung tâm vận hành' })).toHaveAttribute('href', '/system/home');
});

test('owner guard renders protected content for owner', () => {
    render(<MemoryRouter><OwnerRoute><h1>Nhật ký cửa hàng</h1></OwnerRoute></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Nhật ký cửa hàng' })).toBeInTheDocument();
});

test.each(['list-user', 'list-product', 'list-voucher', 'audit', 'turnover', 'profit'])('direct staff access to %s displays a permission result', async path => {
    login('R4');
    render(<MemoryRouter initialEntries={[
        `/system/home/${path}`,
    ]}><Routes><Route path="/system/home/*" element={<HomePageAdmin />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Trang dành cho chủ cửa hàng' })).toBeInTheDocument();
});

test('staff can load the inventory route within the workspace', async () => {
    login('R4');
    render(<MemoryRouter initialEntries={['/system/home/inventory']}><Routes><Route path="/system/home/*" element={<HomePageAdmin />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Kho đã tải' })).toBeInTheDocument();
});

test('drawer can close by escape, overlay and navigation', async () => {
    render(<MemoryRouter initialEntries={['/system/home']}><AdminLayout><LocationProbe /></AdminLayout></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu quản trị' }));
    expect(screen.getByRole('button', { name: 'Đóng menu quản trị', expanded: true })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Mở menu quản trị' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu quản trị' }));
    const overlay = screen.getAllByRole('button', { name: 'Đóng menu quản trị' }).find(button => button.classList.contains('admin-navigation-overlay'));
    fireEvent.click(overlay);
    expect(screen.getByRole('button', { name: 'Mở menu quản trị' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu quản trị' }));
    fireEvent.click(screen.getByRole('link', { name: 'Đơn hàng' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mở menu quản trị' })).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.getByLabelText('Đường dẫn kiểm thử')).toHaveTextContent('/system/home/list-order');
});

test('global search navigates to a real encoded order filter', async () => {
    render(<MemoryRouter initialEntries={['/system/home']}><AdminLayout><LocationProbe /></AdminLayout></MemoryRouter>);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm đơn hàng từ menu quản trị' }), { target: { value: '  #105 + khách  ' } });
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() => expect(screen.getByLabelText('Đường dẫn kiểm thử')).toHaveTextContent('/system/home/list-order?keyword=%23105%20%2B%20kh%C3%A1ch'));
});

test('closed mobile navigation is excluded from keyboard access and becomes available when opened', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = () => ({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() });
    try {
        render(<MemoryRouter initialEntries={['/system/home']}><AdminLayout><h1>Vận hành</h1></AdminLayout></MemoryRouter>);
        expect(screen.queryByRole('link', { name: 'Đơn hàng' })).not.toBeInTheDocument();
        const sidebar = document.getElementById('admin-navigation');
        expect(sidebar).toHaveAttribute('inert');
        fireEvent.click(screen.getByRole('button', { name: 'Mở menu quản trị' }));
        expect(screen.getByRole('link', { name: 'Đơn hàng' })).toBeInTheDocument();
        expect(sidebar).not.toHaveAttribute('inert');
        fireEvent.click(screen.getByRole('button', { name: 'Đóng thanh điều hướng' }));
        expect(screen.queryByRole('link', { name: 'Đơn hàng' })).not.toBeInTheDocument();
    } finally { window.matchMedia = originalMatchMedia; }
});

test('account menu uses the signed-in identity and closes after navigation', async () => {
    render(<MemoryRouter initialEntries={['/system/home']}><AdminLayout><LocationProbe /></AdminLayout></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản quản trị' }));
    expect(screen.getByRole('link', { name: 'Thông tin cá nhân' })).toHaveAttribute('href', '/system/home/infor/34');
    fireEvent.click(screen.getByRole('link', { name: 'Thông tin cá nhân' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Thông tin cá nhân' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Tài khoản quản trị' })).toHaveAttribute('aria-expanded', 'false');
});
