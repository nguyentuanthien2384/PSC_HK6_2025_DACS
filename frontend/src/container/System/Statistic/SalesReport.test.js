import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import SalesReport from './SalesReport';
import { getStatisticOverturn, getStatisticProfit } from '../../../services/userService';
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

const deliveredRow = (id, extra = {}) => ({ id, totalpriceProduct: 100000, refundAmount: 0, netRevenue: 100000,
    createdAt: '2026-10-01T20:30:00Z', deliveredAt: '2026-10-04T23:15:00Z', isPaymentOnlien: 0,
    typeShipData: { type: 'Giao tiêu chuẩn' }, voucherData: { codeVoucher: 'GIAM10' }, ...extra });

test('settled refund amounts and zero net revenue are displayed and exported; pending refunds stay in revenue', async () => {
    getStatisticOverturn.mockResolvedValue({ errCode: 0, data: [
        deliveredRow(13, { refundAmount: 100000, netRevenue: 0, returnRequest: { status: 'REFUNDED', amount: 100000 } }),
        deliveredRow(14, { totalpriceProduct: 250000, refundAmount: 50000, netRevenue: 200000, isPaymentOnlien: 1 }),
        deliveredRow(15, { totalpriceProduct: 80000, netRevenue: 80000, returnRequest: { status: 'REFUND_PENDING', amount: 80000 } }),
    ] });
    show();
    await screen.findByText('#13');
    expect(screen.getByRole('columnheader', { name: 'Đã hoàn tiền' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Doanh thu sau hoàn' })).toBeInTheDocument();
    const fullyRefunded = within(screen.getByRole('row', { name: /#13/ })).getAllByRole('cell');
    expect(fullyRefunded[6]).toHaveTextContent('100.000');
    expect(fullyRefunded[7]).toHaveTextContent('100.000');
    expect(fullyRefunded[8]).toHaveTextContent(/^0$/);
    const partialRefund = within(screen.getByRole('row', { name: /#14/ })).getAllByRole('cell');
    expect(partialRefund[7]).toHaveTextContent('50.000');
    expect(partialRefund[8]).toHaveTextContent('200.000');
    const pendingRefund = within(screen.getByRole('row', { name: /#15/ })).getAllByRole('cell');
    expect(pendingRefund[7]).toHaveTextContent(/^0$/);
    expect(pendingRefund[8]).toHaveTextContent('80.000');
    expect(screen.getByText(/Tổng doanh thu:/)).toHaveTextContent('280.000');
    fireEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    await waitFor(() => expect(CommonUtils.exportExcel).toHaveBeenCalledWith([
        expect.objectContaining({ 'Mã đơn': 13, 'Đã hoàn tiền': 100000, 'Doanh thu sau hoàn': 0, 'Tổng tiền': 100000, 'Ngày đặt': '02/10/2026 03:30:00', 'Ngày giao xong': '05/10/2026 06:15:00' }),
        expect.objectContaining({ 'Mã đơn': 14, 'Đã hoàn tiền': 50000, 'Doanh thu sau hoàn': 200000, 'Thanh toán': 'Online' }),
        expect.objectContaining({ 'Mã đơn': 15, 'Đã hoàn tiền': 0, 'Doanh thu sau hoàn': 80000, 'Thanh toán': 'COD' }),
    ], 'Doanh thu', 'Turnover'));
});

test('profit report preserves the server cost treatment of resellable and damaged returned goods', async () => {
    getStatisticProfit.mockResolvedValue({ errCode: 0, data: [
        deliveredRow(21, { refundAmount: 100000, netRevenue: 0, importPrice: 70000, profitPrice: 0, returnRequest: { status: 'REFUNDED', resellable: true } }),
        deliveredRow(22, { refundAmount: 100000, netRevenue: 0, importPrice: 80000, profitPrice: -80000, returnRequest: { status: 'REFUNDED', resellable: false } }),
    ] });
    render(<SalesReport profit />);
    await screen.findByText('#21');
    expect(getStatisticProfit).toHaveBeenCalledWith(expect.objectContaining({ type: 'month', oneDate: expect.any(Date) }));
    expect(getStatisticOverturn).not.toHaveBeenCalled();
    const resellable = within(screen.getByRole('row', { name: /#21/ })).getAllByRole('cell');
    expect(resellable[8]).toHaveTextContent(/^0$/);
    expect(resellable[9]).toHaveTextContent('70.000');
    expect(resellable[10]).toHaveTextContent(/^0$/);
    const damaged = within(screen.getByRole('row', { name: /#22/ })).getAllByRole('cell');
    expect(damaged[9]).toHaveTextContent('80.000');
    expect(damaged[10]).toHaveTextContent('-80.000');
    expect(screen.getByText(/Tổng lợi nhuận ước tính:/)).toHaveTextContent('-80.000');
    fireEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    await waitFor(() => expect(CommonUtils.exportExcel).toHaveBeenCalledWith([
        expect.objectContaining({ 'Mã đơn': 21, 'Đã hoàn tiền': 100000, 'Doanh thu sau hoàn': 0, 'Giá vốn ước tính': 70000, 'Lợi nhuận ước tính': 0 }),
        expect.objectContaining({ 'Mã đơn': 22, 'Đã hoàn tiền': 100000, 'Doanh thu sau hoàn': 0, 'Giá vốn ước tính': 80000, 'Lợi nhuận ước tính': -80000 }),
    ], 'Lợi nhuận ước tính', 'Profit'));
});
