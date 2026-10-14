import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import StockProduct from './StockProduct';
import { getStatisticStockProduct } from '../../../services/userService';

jest.mock('../../../services/userService', () => ({ getStatisticStockProduct: jest.fn() }));
jest.mock('../../../utils/CommonUtils', () => ({ exportExcel: jest.fn() }));
const row = (id, name) => ({ id, productdData: { name, categoryData: { value: 'Áo' }, brandData: { value: 'DACS' } }, productDetaildData: { nameDetail: 'Xanh' }, sizeData: { value: 'M' }, onHand: 8, reserved: 2, stock: 6 });
const result = (id, name, count = 18) => ({ errCode: 0, data: [row(id, name)], count });
beforeEach(() => jest.clearAllMocks());

test('initial stock loads once and only switches row numbers and selected page after the new data arrives', async () => {
    let finishNext;
    getStatisticStockProduct.mockResolvedValueOnce(result(1, 'Áo cũ')).mockImplementationOnce(() => new Promise(resolve => { finishNext = resolve; }));
    render(<StockProduct />);
    await screen.findByText('Áo cũ - Xanh - M');
    expect(getStatisticStockProduct).toHaveBeenCalledTimes(1);
    const initialSignal = getStatisticStockProduct.mock.calls[0][0].signal;
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(getStatisticStockProduct).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 6, offset: 6, signal: expect.anything() }));
    expect(initialSignal.aborted).toBe(true);
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang 1' })).toHaveAttribute('aria-current', 'page');
    expect(within(screen.getByRole('row', { name: /Áo cũ/ })).getAllByRole('cell')[0]).toHaveTextContent(/^1$/);
    await act(async () => { finishNext(result(2, 'Áo mới')); });
    expect(screen.queryByText('Áo cũ - Xanh - M')).not.toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Áo mới/ })).getAllByRole('cell')[0]).toHaveTextContent(/^7$/);
    expect(screen.getByRole('button', { name: 'Trang 2' })).toHaveAttribute('aria-current', 'page');
});

test('refreshing a page that has disappeared fetches the last available page', async () => {
    getStatisticStockProduct.mockResolvedValueOnce(result(1, 'Trang đầu')).mockResolvedValueOnce(result(2, 'Trang hai'))
        .mockResolvedValueOnce({ errCode: 0, data: [], count: 6 }).mockResolvedValueOnce(result(3, 'Còn lại', 6));
    render(<StockProduct />);
    await screen.findByText('Trang đầu - Xanh - M');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText('Trang hai - Xanh - M');
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    await screen.findByText('Còn lại - Xanh - M');
    expect(getStatisticStockProduct.mock.calls.map(([query]) => query.offset)).toEqual([0, 6, 6, 0]);
    expect(screen.getByText('Trang 1 / 1 · 1–6 / 6 kết quả')).toBeInTheDocument();
});

test('request failures identify retained data as outdated and refreshing recovers', async () => {
    getStatisticStockProduct.mockResolvedValueOnce(result(1, 'Đã tải')).mockRejectedValueOnce(new Error('Mất kết nối')).mockResolvedValueOnce(result(2, 'Mới nhất'));
    render(<StockProduct />);
    await screen.findByText('Đã tải - Xanh - M');
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối Dữ liệu bên dưới chưa được cập nhật.');
    expect(screen.getByText('Đã tải - Xanh - M')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    await screen.findByText('Mới nhất - Xanh - M');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('leaving the stock page aborts its pending request', async () => {
    getStatisticStockProduct.mockImplementation(() => new Promise(() => {}));
    const view = render(<StockProduct />);
    await waitFor(() => expect(getStatisticStockProduct).toHaveBeenCalledTimes(1));
    const signal = getStatisticStockProduct.mock.calls[0][0].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
});

test('an export failure does not label a successfully loaded table as outdated', async () => {
    getStatisticStockProduct.mockResolvedValueOnce(result(1, 'Đã tải')).mockRejectedValueOnce(new Error('Không thể xuất Excel'));
    render(<StockProduct />);
    await screen.findByText('Đã tải - Xanh - M');
    fireEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xuất Excel');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Dữ liệu bên dưới chưa được cập nhật');
    expect(screen.getByText('Đã tải - Xanh - M')).toBeInTheDocument();
});
