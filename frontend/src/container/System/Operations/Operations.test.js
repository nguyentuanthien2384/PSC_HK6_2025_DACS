import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OperationsOrders from './OperationsOrders';
import OperationsReturns from './OperationsReturns';
import { operationsFiltersFromSearch } from './operationsShared';
import * as api from '../../../services/adminOperationsService';
import { getActiveShippers } from '../../../services/shippingService';

let mockSearch = '';
let mockNavigate;
jest.mock('react-router-dom', () => {
    const React = require('react');
    return {
        Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
        useSearchParams: () => {
            const [params, setParams] = React.useState(() => new URLSearchParams(mockSearch));
            mockNavigate = value => setParams(new URLSearchParams(value));
            return [params, value => { mockSearch = value.toString(); setParams(new URLSearchParams(value)); }];
        }
    };
}, { virtual: true });
jest.mock('../../../services/adminOperationsService', () => ({ getOperationsOrders: jest.fn(), getOperationsReturns: jest.fn(), bulkOperationsOrders: jest.fn() }));
jest.mock('../../../services/shippingService', () => ({ getActiveShippers: jest.fn() }));
const order = { id: 42, customerName: 'Người nhận', statusId: 'S3', totalPrice: 100000, isPaymentOnlien: 0, deliveryProvider: 'internal', actions: { confirm: true, assign: false } };
const orders = extra => ({ errCode: 0, data: [order], count: 21, counters: { S3: 21 }, ...extra });
beforeEach(() => {
    jest.clearAllMocks(); mockSearch = '';
    api.getOperationsOrders.mockResolvedValue(orders());
    api.getOperationsReturns.mockResolvedValue({ errCode: 0, data: [], count: 0, counters: {} });
    getActiveShippers.mockResolvedValue({ errCode: 0, data: [{ id: 7, firstName: 'Người giao' }] });
});

test('dashboard status links and the header order search load URL filters, then react to navigation on the same screen', async () => {
    mockSearch = 'status=S3&keyword=Kh%C3%A1ch&page=2&payment=COD&carrier=internal&from=2026-10-12&to=2026-10-13';
    render(<OperationsOrders />);
    await screen.findByRole('link', { name: '#42' });
    expect(api.getOperationsOrders).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'S3', keyword: 'Khách', page: 2, payment: 'COD', carrier: 'internal', from: '2026-10-12', to: '2026-10-13' }), expect.any(AbortSignal));
    expect(screen.getByLabelText('Tìm đơn hoặc khách hàng')).toHaveValue('Khách');
    await act(async () => mockNavigate('keyword=42&status=S4'));
    await waitFor(() => expect(api.getOperationsOrders).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: '42', status: 'S4', page: 1, payment: 'ALL', carrier: 'ALL' }), expect.any(AbortSignal)));
    expect(screen.getByLabelText('Tìm đơn hoặc khách hàng')).toHaveValue('42');
    expect(screen.getByLabelText('Trạng thái')).toHaveValue('S4');
});

test('filter application and pagination persist URL values while clearing selected orders', async () => {
    render(<OperationsOrders />); await screen.findByRole('link', { name: '#42' });
    fireEvent.click(screen.getByLabelText('Chọn đơn 42'));
    expect(screen.getByRole('button', { name: 'Xử lý 1 đơn đã chọn' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(api.getOperationsOrders).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }), expect.any(AbortSignal)));
    expect(mockSearch).toBe('page=2');
    await screen.findByRole('link', { name: '#42' });
    expect(screen.getByRole('button', { name: 'Xử lý 0 đơn đã chọn' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Tìm đơn hoặc khách hàng'), { target: { value: '  đơn mới  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng bộ lọc' }));
    await waitFor(() => expect(api.getOperationsOrders).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, keyword: 'đơn mới' }), expect.any(AbortSignal)));
    expect(new URLSearchParams(mockSearch).get('keyword')).toBe('đơn mới');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    await waitFor(() => expect(mockSearch).toBe(''));
});

test('partial bulk results preserve named failures and prevent duplicate submissions', async () => {
    api.getOperationsOrders.mockResolvedValue(orders({ data: [order, { ...order, id: 43 }], count: 2 }));
    let finish;
    api.bulkOperationsOrders.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<OperationsOrders />); await screen.findByRole('link', { name: '#42' });
    fireEvent.click(screen.getByLabelText('Chọn tất cả đơn đủ điều kiện trên trang'));
    fireEvent.click(screen.getByRole('button', { name: 'Xử lý 2 đơn đã chọn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thao tác' }));
    expect(screen.getByRole('button', { name: 'Đang xử lý…' })).toBeDisabled();
    expect(api.bulkOperationsOrders).toHaveBeenCalledTimes(1);
    expect(api.bulkOperationsOrders).toHaveBeenCalledWith({ action: 'CONFIRM', orderIds: [42, 43] });
    await act(async () => finish({ errCode: 0, succeeded: 1, failed: 1, results: [{ orderId: 42, errCode: 0, errMessage: 'Đã xác nhận' }, { orderId: 43, errCode: 2, errMessage: 'Đơn đã hủy' }] }));
    expect(await screen.findByText('Thành công 1, chưa xử lý 1.')).toBeInTheDocument();
    expect(screen.getByText('#43: Đơn đã hủy')).toBeInTheDocument();
    await waitFor(() => expect(api.getOperationsOrders).toHaveBeenCalledTimes(2));
});

test('return queue reads and updates URL filters, and labels the stored lowercase manual refund correctly', async () => {
    mockSearch = 'status=REFUND_PENDING&keyword=42';
    api.getOperationsReturns.mockResolvedValue({ errCode: 0, data: [{ id: 5, orderId: 42, reason: 'Sai màu', status: 'REFUNDED', refundMethod: 'manual', amount: 100000 }], count: 1, counters: {} });
    render(<OperationsReturns />); await screen.findByText('Yêu cầu #5');
    expect(api.getOperationsReturns).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'REFUND_PENDING', keyword: '42' }), expect.any(AbortSignal));
    expect(screen.getByText(/xác nhận thủ công/)).toBeInTheDocument();
    await act(async () => mockNavigate('status=REQUESTED&keyword=Khach'));
    await waitFor(() => expect(api.getOperationsReturns).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'REQUESTED', keyword: 'Khach', page: 1 }), expect.any(AbortSignal)));
    expect(screen.getByLabelText('Trạng thái trả hàng')).toHaveValue('REQUESTED');
});

test('unsafe URL values fall back to bounded known filters', () => {
    const value = operationsFiltersFromSearch(new URLSearchParams('status=DROP&keyword=' + 'a'.repeat(110) + '&from=2026-02-31&to=2026-10-13&page=9999999'), { status: 'ALL', keyword: '', from: '', to: '' }, { status: ['ALL', 'S3'] });
    expect(value).toEqual({ page: 1, filters: { status: 'ALL', keyword: 'a'.repeat(100), from: '', to: '2026-10-13' } });
});
