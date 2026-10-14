import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AddSupplier from './AddSupplier';
import * as api from '../../../services/userService';

let mockSupplierId;
jest.mock('react-router-dom', () => {
    global.TextEncoder = require('util').TextEncoder;
    const actual = jest.requireActual('../../../../node_modules/react-router/dist/development/index.js');
    return { ...actual, useParams: () => ({ id: mockSupplierId }) };
}, { virtual: true });
jest.mock('../../../services/userService', () => ({ getDetailSupplierByIdService: jest.fn(), createNewSupplierService: jest.fn(), updateSupplierService: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const supplier = { name: 'Nhà cung cấp A', email: 'a@example.test', address: 'Hà Nội', phonenumber: '0901234567' };
beforeEach(() => {
    jest.clearAllMocks(); mockSupplierId = undefined;
    api.getDetailSupplierByIdService.mockResolvedValue({ errCode: 0, data: supplier });
    api.createNewSupplierService.mockResolvedValue({ errCode: 0 });
    api.updateSupplierService.mockResolvedValue({ errCode: 0 });
});

test('supplier creation labels address distinct fields and rejects incomplete input', async () => {
    render(<MemoryRouter><AddSupplier /></MemoryRouter>);
    const labels = ['Tên nhà cung cấp', 'Địa chỉ email', 'Địa chỉ', 'Số điện thoại'];
    expect(new Set(labels.map(label => screen.getByLabelText(label).id)).size).toBe(4);
    fireEvent.submit(screen.getByRole('form', { name: 'Thông tin nhà cung cấp' }));
    expect(screen.getByRole('alert')).toHaveTextContent('đầy đủ thông tin');
    expect(api.createNewSupplierService).not.toHaveBeenCalled();
    labels.forEach((label, index) => fireEvent.change(screen.getByLabelText(label), { target: { value: [supplier.name, supplier.email, supplier.address, supplier.phonenumber][index] } }));
    fireEvent.submit(screen.getByRole('form', { name: 'Thông tin nhà cung cấp' }));
    await waitFor(() => expect(api.createNewSupplierService).toHaveBeenCalledWith(supplier));
});

test('supplier edit blocks save until the current route loads and ignores an older response', async () => {
    let first; mockSupplierId = '2';
    api.getDetailSupplierByIdService.mockReturnValueOnce(new Promise(resolve => { first = resolve; }));
    const view = render(<MemoryRouter><AddSupplier /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Lưu thông tin' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: 'Thông tin nhà cung cấp' }));
    expect(api.updateSupplierService).not.toHaveBeenCalled();
    mockSupplierId = '3'; view.rerender(<MemoryRouter><AddSupplier /></MemoryRouter>);
    await screen.findByDisplayValue('Nhà cung cấp A');
    await act(async () => { first({ errCode: 0, data: { ...supplier, name: 'Nhà cung cấp cũ' } }); });
    expect(screen.queryByDisplayValue('Nhà cung cấp cũ')).not.toBeInTheDocument();
    expect(api.getDetailSupplierByIdService.mock.calls[0][1].signal.aborted).toBe(true);
    fireEvent.submit(screen.getByRole('form', { name: 'Thông tin nhà cung cấp' }));
    await waitFor(() => expect(api.updateSupplierService).toHaveBeenCalledWith({ ...supplier, id: '3' }));
});

test('supplier load failures offer retry and duplicate submissions stay blocked during save', async () => {
    let finish; mockSupplierId = '2';
    api.getDetailSupplierByIdService.mockRejectedValueOnce(new Error('Lỗi kết nối'));
    api.updateSupplierService.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<MemoryRouter><AddSupplier /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi kết nối');
    expect(screen.getByRole('button', { name: 'Lưu thông tin' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' })); await screen.findByDisplayValue('Nhà cung cấp A');
    fireEvent.submit(screen.getByRole('form', { name: 'Thông tin nhà cung cấp' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Thông tin nhà cung cấp' }));
    expect(api.updateSupplierService).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Tên nhà cung cấp')).toBeDisabled();
    await act(async () => { finish({ errCode: 0 }); });
    expect(screen.getByLabelText('Tên nhà cung cấp')).not.toBeDisabled();
});
