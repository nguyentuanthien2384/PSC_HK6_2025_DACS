import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import NotificationsBell from './NotificationsBell';
import * as operations from '../../services/notificationService';

let mockPath = '/system/home';
jest.mock('react-router-dom', () => ({
    Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
    useLocation: () => ({ pathname: mockPath, search: '' }),
}), { virtual: true });
jest.mock('../../services/notificationService', () => ({ getNotifications: jest.fn(), readNotification: jest.fn(), readAllNotifications: jest.fn(), notifyNotificationsChanged: jest.fn() }));
const item = { id: 40, title: 'Đơn đang giao', message: 'Đơn #12 đã được nhận.', readAt: null, createdAt: '2026-10-14T03:00:00Z', link: '/system/home/order-detail/12' };
const result = (data = [item], unreadCount = 3) => ({ errCode: 0, unreadCount, data, count: data.length });
beforeEach(() => {
    jest.clearAllMocks(); mockPath = '/system/home';
    operations.getNotifications.mockResolvedValue(result());
    operations.readNotification.mockResolvedValue({ errCode: 0 });
    operations.readAllNotifications.mockResolvedValue({ errCode: 0 });
});
afterEach(() => jest.useRealTimers());

async function openBell() {
    fireEvent.click(await screen.findByRole('button', { name: 'Thông báo, 3 chưa đọc' }));
    await screen.findByRole('article', { name: 'Thông báo 40' });
    return screen.getByRole('region', { name: 'Bảng thông báo' });
}

test('clicking the bell opens recent notifications in place and admin all-link retains workspace context', async () => {
    render(<NotificationsBell allHref="/system/home/notifications" />);
    const panel = await openBell();
    expect(screen.getByRole('button', { name: 'Thông báo, 3 chưa đọc' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel).getByRole('link', { name: 'Đơn đang giao' })).toHaveAttribute('href', '/system/home/order-detail/12');
    expect(within(panel).getByRole('link', { name: 'Xem tất cả thông báo' })).toHaveAttribute('href', '/system/home/notifications');
    expect(operations.getNotifications).toHaveBeenLastCalledWith({ limit: 6, offset: 0, signal: expect.any(AbortSignal) });
    expect(screen.queryByRole('link', { name: /^Thông báo,/ })).not.toBeInTheDocument();
    expect(mockPath).toBe('/system/home');
});

test('Escape restores bell focus; outside pointer or navigation closes the panel and cancels its request', async () => {
    const { rerender } = render(<NotificationsBell />);
    await openBell();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Bảng thông báo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thông báo, 3 chưa đọc' })).toHaveFocus();
    await openBell();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('region', { name: 'Bảng thông báo' })).not.toBeInTheDocument();
    await openBell();
    const signal = operations.getNotifications.mock.calls.at(-1)[0].signal;
    mockPath = '/system/home/inventory';
    rerender(<NotificationsBell />);
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('region', { name: 'Bảng thông báo' })).not.toBeInTheDocument();
});

test('opening never marks notifications read and unsafe destinations are not rendered as links', async () => {
    operations.getNotifications.mockResolvedValue(result([{ ...item, link: '//evil.example' }]));
    render(<NotificationsBell />);
    const panel = await openBell();
    expect(within(panel).queryByRole('link', { name: 'Đơn đang giao' })).not.toBeInTheDocument();
    expect(operations.readNotification).not.toHaveBeenCalled();
    expect(operations.readAllNotifications).not.toHaveBeenCalled();
});

test('a rejected read keeps the persisted unread state and a successful retry refreshes it', async () => {
    operations.readNotification.mockResolvedValueOnce({ errCode: 2, errMessage: 'Không thể cập nhật' });
    render(<NotificationsBell />);
    await openBell();
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc: Đơn đang giao' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể cập nhật');
    expect(screen.getByRole('article', { name: 'Thông báo 40' })).toHaveClass('is-unread');
    expect(operations.notifyNotificationsChanged).not.toHaveBeenCalled();
    operations.getNotifications.mockResolvedValue(result([{ ...item, readAt: '2026-10-14T04:00:00Z' }], 0));
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc: Đơn đang giao' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Thông báo' })).toBeInTheDocument());
    expect(operations.readNotification).toHaveBeenLastCalledWith(40);
    expect(operations.notifyNotificationsChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('article', { name: 'Thông báo 40' })).not.toHaveClass('is-unread');
});

test('read-all prevents duplicate mutations and waits for confirmed server state', async () => {
    let finish;
    operations.readAllNotifications.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<NotificationsBell />);
    await openBell();
    const button = screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' });
    fireEvent.click(button); fireEvent.click(button);
    expect(operations.readAllNotifications).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('article', { name: 'Thông báo 40' })).toHaveClass('is-unread');
    operations.getNotifications.mockResolvedValue(result([{ ...item, readAt: '2026-10-14T04:00:00Z' }], 0));
    await act(async () => finish({ errCode: 0 }));
    expect(screen.getByRole('button', { name: 'Thông báo' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Thông báo 40' })).not.toHaveClass('is-unread');
});

test('panel loading failure has retry and an empty result is distinct from an error', async () => {
    render(<NotificationsBell />);
    await screen.findByRole('button', { name: 'Thông báo, 3 chưa đọc' });
    operations.getNotifications.mockRejectedValueOnce(new Error('Mất kết nối'));
    fireEvent.click(screen.getByRole('button', { name: 'Thông báo, 3 chưa đọc' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối');
    operations.getNotifications.mockResolvedValue(result([], 0));
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chưa có thông báo mới.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('newest responses own unread badge and unmount aborts reads and removes polling', async () => {
    jest.useFakeTimers();
    let oldResolve;
    operations.getNotifications.mockReturnValueOnce(new Promise(resolve => { oldResolve = resolve; }));
    const { unmount } = render(<NotificationsBell />);
    fireEvent(window, new Event('notifications-changed'));
    await act(async () => {});
    await act(async () => oldResolve(result([], 8)));
    expect(screen.getByRole('button', { name: 'Thông báo, 3 chưa đọc' })).toBeInTheDocument();
    await act(async () => jest.advanceTimersByTime(30000));
    expect(operations.getNotifications).toHaveBeenCalledTimes(3);
    const signal = operations.getNotifications.mock.calls.at(-1)[0].signal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => jest.advanceTimersByTime(60000));
    expect(operations.getNotifications).toHaveBeenCalledTimes(3);
});
