import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ManageSupplier from './ManageSupplier';
import * as api from '../../../services/userService';
import CommonUtils from '../../../utils/CommonUtils';

jest.mock('react-router-dom', () => {
    global.TextEncoder = require('util').TextEncoder;
    return jest.requireActual('../../../../node_modules/react-router/dist/development/index.js');
}, { virtual: true });
jest.mock('../../../services/userService', () => ({ getAllSupplier: jest.fn(), deleteSupplierService: jest.fn() }));
jest.mock('../../../utils/CommonUtils', () => ({ exportExcel: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const supplier = { id: 10, name: 'Đối tác A', phonenumber: '0901234567', email: 'a@example.test', address: 'Hà Nội' };
beforeEach(() => {
    jest.clearAllMocks();
    api.getAllSupplier.mockImplementation(params => Promise.resolve({ errCode: 0, data: [{ ...supplier, name: params.keyword || supplier.name }], count: params.keyword ? 1 : 13 }));
    api.deleteSupplierService.mockResolvedValue({ errCode: 0 });
});

test('staff can find create/edit actions and supplier search resets the requested page', async () => {
    render(<MemoryRouter><ManageSupplier /></MemoryRouter>);
    await screen.findByText('Đối tác A');
    expect(screen.getByRole('link', { name: '+ Thêm nhà cung cấp' })).toHaveAttribute('href', '/system/home/add-supplier');
    expect(screen.getByRole('link', { name: 'Chỉnh sửa' })).toHaveAttribute('href', '/system/home/edit-supplier/10');
    fireEvent.click(screen.getByRole('button', { name: 'Trang 3' }));
    await waitFor(() => expect(api.getAllSupplier).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 12 })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trang 3' })).not.toBeDisabled());
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  Đối tác B  ' } });
    fireEvent.submit(screen.getByRole('search'));
    await screen.findByText('Đối tác B');
    expect(api.getAllSupplier).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: 'Đối tác B', offset: 0 }));
    expect(screen.getByText(/Trang 1 \/ 1/)).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Đối tác B/ })).toHaveTextContent('1Đối tác B');
});

test('deletion asks for the selected supplier and reloads only after explicit confirmation', async () => {
    render(<MemoryRouter><ManageSupplier /></MemoryRouter>); await screen.findByText('Đối tác A');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa nhà cung cấp Đối tác A' }));
    expect(api.deleteSupplierService).not.toHaveBeenCalled();
    const confirm = screen.getByRole('region', { name: 'Xác nhận xóa nhà cung cấp' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Xác nhận xóa' }));
    await waitFor(() => expect(api.deleteSupplierService).toHaveBeenCalledWith({ data: { id: 10 } }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Xác nhận xóa nhà cung cấp' })).not.toBeInTheDocument());
    expect(api.getAllSupplier).toHaveBeenCalledTimes(2);
});

test('export asks for the full filtered supplier list and exposes read failures with retry', async () => {
    api.getAllSupplier.mockRejectedValueOnce(new Error('Mất kết nối'));
    render(<MemoryRouter><ManageSupplier /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' })); await screen.findByText('Đối tác A');
    fireEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    await waitFor(() => expect(CommonUtils.exportExcel).toHaveBeenCalled());
    expect(api.getAllSupplier).toHaveBeenLastCalledWith({ keyword: '' });
    expect(api.getAllSupplier.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
});
