import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import NotificationsPage, { notificationDestination } from './NotificationsPage';
import * as operations from '../../services/notificationService';

jest.mock('react-router-dom', () => ({ Link: ({ children, to }) => <a href={to}>{children}</a> }), { virtual: true });
jest.mock('../../services/notificationService', () => ({ getNotifications: jest.fn(), readNotification: jest.fn(), readAllNotifications: jest.fn(), notifyNotificationsChanged: jest.fn() }));
const notification = { id: 40, title: 'Đơn đang giao', message: 'Đơn #12 đã được shipper nhận.', readAt: null, createdAt: '2026-10-12T03:00:00Z', link: '/user/order/7' };
const result = (data = [notification], unreadCount = 1, count = data.length) => ({ errCode: 0, data, unreadCount, count });
beforeEach(() => { jest.clearAllMocks(); operations.getNotifications.mockResolvedValue(result()); operations.readNotification.mockResolvedValue({ errCode: 0 }); operations.readAllNotifications.mockResolvedValue({ errCode: 0 }); });

test.each(['https://evil.example/', '//evil.example', '/user/order/7/../../login', '/system/home/../settings', '/user/order/%37', '/shipper\\evil', '/user/order/7\n'])('unsafe notification link %s is discarded', link => expect(notificationDestination({ link })).toBeNull());
test.each(['/user/order/7', '/system/home/order-detail/12', '/shipper', '/shipper?tab=working'])('allowed order destination %s remains local', link => expect(notificationDestination({ link })).toBe(link));

test('server-owned notifications display persisted unread state and only safe detail links', async () => {
    operations.getNotifications.mockResolvedValue(result([notification, { ...notification, id: 41, readAt: '2026-10-12T04:00:00Z', link: '//external.example' }]));
    render(<NotificationsPage />);
    const unread = await screen.findByRole('article', { name: 'Thông báo 40' });
    expect(unread).toHaveClass('unread');
    expect(within(unread).getByRole('link', { name: 'Xem chi tiết' })).toHaveAttribute('href', '/user/order/7');
    const read = screen.getByRole('article', { name: 'Thông báo 41' });
    expect(within(read).queryByRole('button', { name: 'Đánh dấu đã đọc' })).not.toBeInTheDocument();
    expect(within(read).queryByRole('link')).not.toBeInTheDocument();
    expect(operations.getNotifications).toHaveBeenCalledWith({ limit: 20, offset: 0 });
});

test('read rejection preserves unread state; successful read reloads from the server', async () => {
    operations.readNotification.mockResolvedValueOnce({ errCode: 2, errMessage: 'Thông báo không thuộc tài khoản này' });
    render(<NotificationsPage />);
    const unread = await screen.findByRole('article', { name: 'Thông báo 40' });
    fireEvent.click(within(unread).getByRole('button', { name: 'Đánh dấu đã đọc' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Thông báo không thuộc tài khoản này');
    expect(unread).toHaveClass('unread');
    expect(operations.notifyNotificationsChanged).not.toHaveBeenCalled();
    operations.getNotifications.mockResolvedValue(result([{ ...notification, readAt: '2026-10-12T05:00:00Z' }], 0));
    fireEvent.click(within(unread).getByRole('button', { name: 'Đánh dấu đã đọc' }));
    await waitFor(() => expect(screen.getByText('0 thông báo chưa đọc')).toBeInTheDocument());
    expect(operations.readNotification).toHaveBeenLastCalledWith(40);
    expect(operations.notifyNotificationsChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('article', { name: 'Thông báo 40' })).not.toHaveClass('unread');
});

test('read-all sends no forged owner id and prevents repeated mutations while awaiting server', async () => {
    let resolve;
    operations.readAllNotifications.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<NotificationsPage />);
    const button = await screen.findByRole('button', { name: 'Đánh dấu tất cả đã đọc' });
    await screen.findByRole('article');
    fireEvent.click(button); fireEvent.click(button);
    expect(operations.readAllNotifications).toHaveBeenCalledTimes(1);
    expect(operations.readAllNotifications).toHaveBeenCalledWith();
    operations.getNotifications.mockResolvedValue(result([{ ...notification, readAt: '2026-10-12T05:00:00Z' }], 0));
    await act(async () => resolve({ errCode: 0 }));
    expect(screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' })).toBeDisabled();
});

test('pagination and read errors have separate retry controls', async () => {
    operations.getNotifications.mockRejectedValueOnce(new Error('Không thể kết nối'));
    render(<NotificationsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể kết nối');
    operations.getNotifications.mockResolvedValue(result([notification], 1, 21));
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(operations.getNotifications).toHaveBeenLastCalledWith({ limit: 20, offset: 20 }));
});
