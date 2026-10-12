import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SalesReport from './SalesReport';
import { getStatisticOverturn } from '../../../services/userService';
import CommonUtils from '../../../utils/CommonUtils';
jest.mock('../../../services/userService', () => ({ getStatisticOverturn: jest.fn(), getStatisticProfit: jest.fn() }));
jest.mock('../../../utils/CommonUtils', () => ({ formatter: new Intl.NumberFormat('vi-VN'), exportExcel: jest.fn() }));
jest.mock('react-datepicker', () => function Picker() { return <input aria-label="Ngày thống kê" />; });
jest.mock('react-router-dom', () => ({ Link: ({ children, to }) => <a href={to}>{children}</a> }), { virtual: true });
beforeEach(() => jest.clearAllMocks());
const show = () => render(<SalesReport />);
test('initial report loads the current month and handles empty periods', async () => {
    getStatisticOverturn.mockResolvedValue({ errCode: 0, data: [] });
    show();
    expect(await screen.findByText('Không có đơn đã giao trong khoảng thời gian này.')).toBeInTheDocument();
    expect(getStatisticOverturn).toHaveBeenCalledWith(expect.objectContaining({ type: 'month', oneDate: expect.any(Date) }));
    expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeDisabled();
});
test('invalid day selection clears old report and prevents exporting stale totals', async () => {
    getStatisticOverturn.mockResolvedValue({ errCode: 0, data: [{ id: 1, totalpriceProduct: 100000, createdAt: '2026-10-01', deliveredAt: '2026-10-05' }] });
    show(); await screen.findByText('#1');
    expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Loại thống kê'), { target: { value: 'day' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lọc' }));
    expect(screen.getByRole('alert')).toHaveTextContent('đầy đủ');
    expect(screen.queryByText('#1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeDisabled();
    expect(getStatisticOverturn).toHaveBeenCalledTimes(1);
});
test('network errors are visible and filter can retry without leaving loading state stuck', async () => {
    getStatisticOverturn.mockRejectedValueOnce(new Error('Mất kết nối')).mockResolvedValueOnce({ errCode: 0, data: [] });
    show(); expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối');
    fireEvent.click(screen.getByRole('button', { name: 'Lọc' }));
    await screen.findByText('Không có đơn đã giao trong khoảng thời gian này.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lọc' })).toBeEnabled());
    expect(CommonUtils.exportExcel).not.toHaveBeenCalled();
});
