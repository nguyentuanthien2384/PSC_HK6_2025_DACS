import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InventoryManagement from './InventoryManagement';
import * as api from '../../../services/adminInventoryService';

let mockSearch = '';
jest.mock('react-router-dom', () => {
    const React = require('react');
    return { useSearchParams: () => {
        const [params, setParams] = React.useState(() => new URLSearchParams(mockSearch));
        return [params, next => { mockSearch = next.toString(); setParams(new URLSearchParams(next)); }];
    } };
}, { virtual: true });
jest.mock('../../../services/adminInventoryService', () => ({ countInventory: jest.fn(), getAdminInventory: jest.fn(), getInventoryHistory: jest.fn() }));
const variant = { variantId: 8, productId: 3, productName: 'Áo sơ mi', variantName: 'Xanh', size: 'M', sku: 'SKU-8', statusId: 'S1', onHand: 10, reserved: 2, available: 8 };
const response = row => ({ errCode: 0, data: [row || variant], count: 1, categories: [], summary: { variants: 1, available: row?.available ?? 8, reserved: 2, low: 0, out: 0 } });
beforeEach(() => {
    jest.clearAllMocks(); mockSearch = '';
    api.getAdminInventory.mockResolvedValue(response());
    api.getInventoryHistory.mockResolvedValue({ errCode: 0, data: [], count: 0 });
});

test('dashboard low-stock link loads the named inventory filter immediately', async () => {
    mockSearch = 'keyword=%C3%81o%20s%C6%A1%20mi&stock=low';
    render(<InventoryManagement />); await screen.findByRole('button', { name: 'Kiểm kê SKU-8' });
    expect(api.getAdminInventory).toHaveBeenCalledTimes(1);
    expect(api.getAdminInventory).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Áo sơ mi', stock: 'low', offset: 0, limit: 25 }));
    expect(screen.getByLabelText('Tìm sản phẩm / SKU')).toHaveValue('Áo sơ mi');
});

test('a stale count refreshes the open snapshot and key, and requires operator confirmation of the revised stock', async () => {
    api.countInventory.mockResolvedValueOnce({ errCode: 2, errMessage: 'Tồn kho đã thay đổi.', current: { onHand: 9, reserved: 3, available: 6 } })
        .mockResolvedValueOnce({ errCode: 0, errMessage: 'Đã lưu kiểm kê.' });
    render(<InventoryManagement />); fireEvent.click(await screen.findByRole('button', { name: 'Kiểm kê SKU-8' }));
    fireEvent.change(screen.getByLabelText('Tồn sau kiểm kê'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Lý do kiểm kê'), { target: { value: 'Kiểm kê cuối ngày' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận kiểm kê' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Phiếu đã cập nhật tồn mới; hãy kiểm tra số lượng và xác nhận lại.');
    expect(screen.getByText(/Tồn khi mở phiếu/)).toHaveTextContent('9');
    expect(screen.getByText(/Tồn khi mở phiếu/)).toHaveTextContent('3');
    expect(screen.getByLabelText('Tồn sau kiểm kê')).toHaveValue(7);
    expect(api.countInventory).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận kiểm kê' })).toBeEnabled());
    const first = api.countInventory.mock.calls[0][0];
    expect(first.expectedOnHand).toBe(10);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận kiểm kê' }));
    await screen.findByText('Đã lưu kiểm kê.');
    const second = api.countInventory.mock.calls[1][0];
    expect(second).toEqual(expect.objectContaining({ variantId: 8, expectedOnHand: 9, targetOnHand: 7, reason: 'Kiểm kê cuối ngày' }));
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
});

test('an uncertain network failure preserves the key so an explicit retry cannot count stock twice', async () => {
    api.countInventory.mockRejectedValueOnce(new Error('Mất kết nối sau khi gửi'))
        .mockResolvedValueOnce({ errCode: 0, repeated: true, errMessage: 'Lần kiểm kê này đã được ghi nhận.' });
    render(<InventoryManagement />); fireEvent.click(await screen.findByRole('button', { name: 'Kiểm kê SKU-8' }));
    fireEvent.change(screen.getByLabelText('Tồn sau kiểm kê'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Lý do kiểm kê'), { target: { value: 'Kiểm kê cuối ngày' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận kiểm kê' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối sau khi gửi');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận kiểm kê' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận kiểm kê' }));
    await screen.findByText('Lần kiểm kê này đã được ghi nhận.');
    expect(api.countInventory.mock.calls[1][0].idempotencyKey).toBe(api.countInventory.mock.calls[0][0].idempotencyKey);
});
