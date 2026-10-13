import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminAudit, { auditChanges } from './AdminAudit';
import { getAdminAudit } from '../../../services/adminAccountService';

jest.mock('react-router-dom', () => ({ Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a> }), { virtual: true });
jest.mock('../../../services/adminAccountService', () => ({ getAdminAudit: jest.fn() }));
const entry = { id: 3, actorId: 1, actorName: 'Admin Chính', actorRole: 'R1', entityType: 'USER', entityId: '2', action: 'USER_ROLE_CHANGED', summary: 'Chuyển bộ phận', createdAt: '2026-10-13T01:00:00Z', before: { roleId: 'R2', statusId: 'S1' }, after: { roleId: 'R4', statusId: 'S1' } };
const response = (data = [entry], count = 30) => ({ errCode: 0, data, count });
beforeEach(() => { jest.clearAllMocks(); getAdminAudit.mockResolvedValue(response()); });

test('audit presents real actor/role/changes and navigates to the proper business records', async () => {
    getAdminAudit.mockResolvedValue(response([entry, { ...entry, id: 4, entityType: 'ORDER', entityId: 8, action: 'CONFIRMED', summary: 'Đơn đã xác nhận', before: { statusId: 'S3' }, after: { statusId: 'S4' } }], 2));
    render(<AdminAudit />); expect(await screen.findByText('Đổi vai trò')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tài khoản #2' })).toHaveAttribute('href', '/system/home/edit-user/2');
    expect(screen.getByRole('link', { name: 'Đơn hàng #8' })).toHaveAttribute('href', '/system/home/order-detail/8');
    expect(screen.getByText('Chờ xác nhận')).toBeInTheDocument(); expect(screen.getByText('Chờ người giao hàng')).toBeInTheDocument();
    expect(screen.getByText('Khách hàng')).toBeInTheDocument(); expect(screen.getByText('Nhân viên vận hành')).toBeInTheDocument();
});

test('audit applies date/entity/keyword filters, validates range and resets paging', async () => {
    render(<AdminAudit />); await screen.findByText('Chuyển bộ phận'); fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(getAdminAudit).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 }), expect.any(AbortSignal)));
    await screen.findByText('Chuyển bộ phận'); fireEvent.change(screen.getByLabelText('Đối tượng'), { target: { value: 'USER' } });
    fireEvent.change(screen.getByLabelText('Nội dung, mã hoặc người thực hiện'), { target: { value: ' Admin ' } });
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-13' } }); fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng bộ lọc' })); expect(screen.getByRole('alert')).toHaveTextContent('Ngày kết thúc'); expect(getAdminAudit).toHaveBeenCalledTimes(2);
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-14' } }); fireEvent.click(screen.getByRole('button', { name: 'Áp dụng bộ lọc' }));
    await waitFor(() => expect(getAdminAudit).toHaveBeenLastCalledWith({ entityType: 'USER', keyword: 'Admin', from: '2026-10-13', to: '2026-10-14', limit: 25, offset: 0 }, expect.any(AbortSignal)));
    await screen.findByText('Chuyển bộ phận'); fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    await waitFor(() => expect(getAdminAudit).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'ALL', keyword: '', from: '', to: '', offset: 0 }), expect.any(AbortSignal)));
});

test('audit ignores outdated data and supports retry after API errors', async () => {
    let resolve; getAdminAudit.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce(response([{ ...entry, summary: 'Kết quả mới' }], 1)).mockResolvedValueOnce({ errCode: 403, errMessage: 'Không đủ quyền xem nhật ký.' });
    render(<AdminAudit />); fireEvent.change(screen.getByLabelText('Đối tượng'), { target: { value: 'USER' } }); fireEvent.click(screen.getByRole('button', { name: 'Áp dụng bộ lọc' }));
    await screen.findByText('Kết quả mới'); await act(async () => resolve(response())); expect(screen.queryByText('Chuyển bộ phận')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' })); expect(await screen.findByRole('alert')).toHaveTextContent('Không đủ quyền'); expect(screen.queryByText('Kết quả mới')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' })); expect(await screen.findByText('Chuyển bộ phận')).toBeInTheDocument();
});

test('audit changes show only business fields and label inventory/product states without exposing raw payload', () => {
    expect(auditChanges({ entityType: 'PRODUCT', before: { statusId: 'S1', password: 'secret', email: 'hidden' }, after: { statusId: 'S2', token: 'hidden', gatewayResponse: { secret: 'hidden' } } })).toEqual([{ label: 'Trạng thái', before: 'Đang bán', after: 'Đã ẩn' }]);
    expect(auditChanges({ entityType: 'INVENTORY', before: { onHand: 10, reserved: 2 }, after: { onHand: 7, quantity: -3 } })).toContainEqual({ label: 'Tồn kho', before: '10', after: '7' });
    expect(auditChanges({ before: null, after: [] })).toEqual([]);
});
