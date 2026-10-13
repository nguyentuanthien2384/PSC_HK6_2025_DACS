import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ManageUser from './ManageUser';
import * as accounts from '../../../services/adminAccountService';
import { getUser } from '../../../utils/token';

jest.mock('react-router-dom', () => ({ Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a> }), { virtual: true });
jest.mock('../../../services/adminAccountService', () => ({ getAdminAccounts: jest.fn(), changeAdminAccount: jest.fn() }));
jest.mock('../../../utils/token', () => ({ getUser: jest.fn() }));
const owner = { id: 1, firstName: 'Admin', lastName: 'Chính', email: 'admin@example.test', roleId: 'R1', statusId: 'S1', createdAt: '2026-10-13T01:00:00Z' };
const user = { id: 2, firstName: 'Nguyễn', lastName: 'An', email: 'an@example.test', phonenumber: '0901234567', roleId: 'R2', statusId: 'S1', createdAt: '2026-10-12T01:00:00Z' };
const response = (data = [owner, user], count = 30) => ({ errCode: 0, data, count });
beforeEach(() => { jest.clearAllMocks(); getUser.mockReturnValue(owner); accounts.getAdminAccounts.mockResolvedValue(response()); accounts.changeAdminAccount.mockResolvedValue({ errCode: 0, errMessage: 'Đã cập nhật tài khoản và thu hồi các phiên đăng nhập cũ.' }); });

test('account list filters active/locked roles, resets paging and preserves edit/create links', async () => {
    render(<ManageUser />);
    expect(await screen.findByText('Nguyễn An')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+ Thêm tài khoản' })).toHaveAttribute('href', '/system/home/add-user');
    expect(screen.getByRole('button', { name: 'Khóa Admin Chính' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đổi vai trò Admin Chính' })).toBeDisabled();
    const row = screen.getByText('Nguyễn An').closest('tr');
    expect(within(row).getByRole('link', { name: 'Sửa thông tin' })).toHaveAttribute('href', '/system/home/edit-user/2');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(accounts.getAdminAccounts).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25, limit: 25 }), expect.any(AbortSignal)));
    await screen.findByText('Nguyễn An');
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'S2' } });
    await waitFor(() => expect(accounts.getAdminAccounts).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, statusId: 'S2' }), expect.any(AbortSignal)));
    fireEvent.change(screen.getByLabelText('Vai trò'), { target: { value: 'R3' } });
    await screen.findByText('Nguyễn An');
    fireEvent.change(screen.getByLabelText('Email, tên hoặc số điện thoại'), { target: { value: ' An ' } }); fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    await waitFor(() => expect(accounts.getAdminAccounts).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: 'An', roleId: 'R3', statusId: 'S2', offset: 0 }), expect.any(AbortSignal)));
});

test('lock requires reason, rejects repeated submit and refreshes current filters after revoking sessions', async () => {
    let resolve; accounts.changeAdminAccount.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    render(<ManageUser />); await screen.findByText('Nguyễn An');
    fireEvent.change(screen.getByLabelText('Vai trò'), { target: { value: 'R2' } }); await screen.findByText('Nguyễn An');
    fireEvent.click(screen.getByRole('button', { name: 'Khóa Nguyễn An' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Khóa tài khoản');
    expect(screen.getByLabelText('Lý do thay đổi')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Xác nhận thay đổi' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Lý do thay đổi'), { target: { value: '  Khách yêu cầu khóa  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thay đổi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đang cập nhật…' }));
    expect(accounts.changeAdminAccount).toHaveBeenCalledTimes(1);
    expect(accounts.changeAdminAccount).toHaveBeenCalledWith({ id: 2, statusId: 'S2', reason: 'Khách yêu cầu khóa' });
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
    await act(async () => resolve({ errCode: 0, errMessage: 'Đã cập nhật tài khoản và thu hồi các phiên đăng nhập cũ.' }));
    expect(await screen.findByRole('status')).toHaveTextContent('thu hồi các phiên');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(accounts.getAdminAccounts).toHaveBeenLastCalledWith(expect.objectContaining({ roleId: 'R2', offset: 0 }), expect.any(AbortSignal));
});

test('role change requires a different role and reports server courier/owner guard without losing reason', async () => {
    accounts.changeAdminAccount.mockResolvedValueOnce({ errCode: 2, errMessage: 'Shipper còn đơn đang giao/hoàn kho.' });
    render(<ManageUser />); await screen.findByText('Nguyễn An'); fireEvent.click(screen.getByRole('button', { name: 'Đổi vai trò Nguyễn An' }));
    fireEvent.change(screen.getByLabelText('Lý do thay đổi'), { target: { value: 'Chuyển bộ phận' } });
    expect(screen.getByRole('button', { name: 'Xác nhận thay đổi' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Vai trò mới'), { target: { value: 'R4' } }); fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thay đổi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Shipper còn đơn');
    expect(accounts.changeAdminAccount).toHaveBeenCalledWith({ id: 2, roleId: 'R4', reason: 'Chuyển bộ phận' });
    expect(screen.getByLabelText('Lý do thay đổi')).toHaveValue('Chuyển bộ phận');
    fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('locked accounts offer restore with the correct transition', async () => {
    accounts.getAdminAccounts.mockResolvedValue(response([{ ...user, statusId: 'S2' }], 1));
    render(<ManageUser />); await screen.findByText('Nguyễn An'); fireEvent.click(screen.getByRole('button', { name: 'Mở khóa Nguyễn An' }));
    expect(screen.getByText('Trạng thái: Bị khóa → Đang hoạt động.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Lý do thay đổi'), { target: { value: 'Đã xác minh' } }); fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thay đổi' }));
    await waitFor(() => expect(accounts.changeAdminAccount).toHaveBeenCalledWith({ id: 2, statusId: 'S1', reason: 'Đã xác minh' }));
});

test('late responses cannot restore outdated actions, and failed loads offer retry', async () => {
    let resolve; accounts.getAdminAccounts.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce(response([{ ...user, firstName: 'Trần', lastName: 'Mới' }], 1)).mockRejectedValueOnce(new Error('Mất kết nối'));
    render(<ManageUser />); fireEvent.change(screen.getByLabelText('Vai trò'), { target: { value: 'R4' } }); await screen.findByText('Trần Mới');
    await act(async () => resolve(response())); expect(screen.queryByText('Nguyễn An')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'S2' } }); expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối');
    expect(screen.queryByRole('button', { name: 'Khóa Trần Mới' })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Thử lại' })); expect(await screen.findByText('Nguyễn An')).toBeInTheDocument();
});
