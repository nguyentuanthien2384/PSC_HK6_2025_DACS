import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotificationsBell from './NotificationsBell';
import { getNotifications } from '../../services/notificationService';

jest.mock('react-router-dom', () => ({ Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a> }), { virtual: true });
jest.mock('../../services/notificationService', () => ({ getNotifications: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); getNotifications.mockResolvedValue({ errCode: 0, unreadCount: 3, data: [] }); });
afterEach(() => jest.useRealTimers());

test('unread badge refreshes on read events and uses the newest persisted response', async () => {
    let oldResolve;
    getNotifications.mockReturnValueOnce(new Promise(resolve => { oldResolve = resolve; }));
    render(<NotificationsBell />);
    fireEvent(window, new Event('notifications-changed'));
    expect(await screen.findByRole('link', { name: 'Thông báo, 3 chưa đọc' })).toHaveAttribute('href', '/notifications');
    await act(async () => oldResolve({ errCode: 0, unreadCount: 8 }));
    expect(screen.getByRole('link', { name: 'Thông báo, 3 chưa đọc' })).toBeInTheDocument();
    getNotifications.mockResolvedValue({ errCode: 0, unreadCount: 0 });
    fireEvent(window, new Event('notifications-changed'));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Thông báo' })).toBeInTheDocument());
    expect(screen.queryByText('3')).not.toBeInTheDocument();
});

test('polling is cleaned up on unmount and retries expose errors without inventing unread counts', async () => {
    jest.useFakeTimers();
    getNotifications.mockResolvedValueOnce({ errCode: 3, errMessage: 'Mất kết nối' });
    const { unmount } = render(<NotificationsBell />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Thử tải lại số thông báo' }));
    await act(async () => {});
    expect(screen.getByRole('link', { name: 'Thông báo, 3 chưa đọc' })).toBeInTheDocument();
    await act(async () => jest.advanceTimersByTime(30000));
    expect(getNotifications).toHaveBeenCalledTimes(3);
    unmount();
    await act(async () => jest.advanceTimersByTime(60000));
    expect(getNotifications).toHaveBeenCalledTimes(3);
});
