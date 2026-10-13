import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OrderUser from './OrderUser';
import { getAllOrdersByUser, updateStatusOrderService } from '../../services/userService';
import { rateShipper } from '../../services/shippingService';

jest.mock('react-router-dom', () => ({ Link: ({ children, to }) => <a href={to}>{children}</a> }), { virtual: true });
jest.mock('../../services/userService', () => ({ getAllOrdersByUser: jest.fn(), updateStatusOrderService: jest.fn() }));
jest.mock('../../services/shippingService', () => ({ rateShipper: jest.fn() }));
jest.mock('../../utils/token', () => ({ getUser: () => ({ id: 7, roleId: 'R2' }) }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const order = (id, statusId, extra = {}) => ({ id, statusId, createdAt: '2026-10-12T01:00:00Z', isPaymentOnlien: 0,
    totalPrice: 120000, orderDetail: [{ id: id * 10, realPrice: 100000, quantity: 1, product: { name: 'Áo mẫu' } }], ...extra });
const response = orders => ({ errCode: 0, data: [{ id: 8, order: orders }] });

beforeEach(() => { jest.clearAllMocks(); getAllOrdersByUser.mockResolvedValue(response([])); updateStatusOrderService.mockResolvedValue({ errCode: 0 }); });

test('loading, failed request and empty orders are distinct; retry loads orders', async () => {
    getAllOrdersByUser.mockRejectedValueOnce(new Error('Mất kết nối'));
    render(<OrderUser />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    expect(screen.queryByText(/Bạn chưa có đơn/)).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText(/Bạn chưa có đơn/)).toBeInTheDocument();
});

test('cancellation requires a reason and only eligible unpaid orders offer cancellation', async () => {
    getAllOrdersByUser.mockResolvedValue(response([order(1, 'S3'), order(2, 'S4', { isPaymentOnlien: 1 }), order(3, 'S5')]));
    render(<OrderUser />);
    const pending = await screen.findByRole('article', { name: 'Đơn hàng 1' });
    expect(screen.getAllByRole('button', { name: 'Hủy đơn' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Đã nhận hàng' })).not.toBeInTheDocument();
    fireEvent.click(within(pending).getByRole('button', { name: 'Hủy đơn' }));
    expect(within(pending).getByRole('button', { name: 'Xác nhận hủy đơn' })).toBeDisabled();
    fireEvent.change(within(pending).getByLabelText('Lý do hủy đơn'), { target: { value: '  Đặt nhầm sản phẩm  ' } });
    getAllOrdersByUser.mockResolvedValue(response([order(1, 'S7', { cancellationReason: 'Đặt nhầm sản phẩm' })]));
    fireEvent.click(within(pending).getByRole('button', { name: 'Xác nhận hủy đơn' }));
    await waitFor(() => expect(updateStatusOrderService).toHaveBeenCalledWith({ id: 1, statusId: 'S7', cancelReason: 'Đặt nhầm sản phẩm' }));
    expect(await screen.findByText('Lý do hủy: Đặt nhầm sản phẩm')).toBeInTheDocument();
});

test('assigned delivery can be confirmed then rated once; rating failure permits retry', async () => {
    const assigned = order(4, 'S5', { shipperId: 9, shipperData: { firstName: 'An' } });
    getAllOrdersByUser.mockResolvedValue(response([assigned]));
    render(<OrderUser />);
    fireEvent.click(await screen.findByRole('button', { name: 'Đã nhận hàng' }));
    expect(updateStatusOrderService).not.toHaveBeenCalled();
    getAllOrdersByUser.mockResolvedValue(response([{ ...assigned, statusId: 'S6', canRateShipper: true }]));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã nhận hàng' }));
    await waitFor(() => expect(updateStatusOrderService).toHaveBeenCalledWith({ id: 4, statusId: 'S6' }));
    const send = await screen.findByRole('button', { name: 'Gửi đánh giá' });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: '5 sao' }));
    fireEvent.change(screen.getByLabelText('Nhận xét (không bắt buộc)'), { target: { value: '  Giao nhanh  ' } });
    rateShipper.mockResolvedValueOnce({ errCode: 2, errMessage: 'Thử lại đánh giá' });
    fireEvent.click(send);
    expect(await screen.findByRole('alert')).toHaveTextContent('Thử lại đánh giá');
    const rating = { rating: 5, comment: 'Giao nhanh', createdAt: '2026-10-12T02:00:00Z' };
    rateShipper.mockResolvedValueOnce({ errCode: 0, data: rating });
    getAllOrdersByUser.mockResolvedValue(response([{ ...assigned, statusId: 'S6', shipperRating: rating, canRateShipper: false }]));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
    await waitFor(() => expect(rateShipper).toHaveBeenLastCalledWith({ orderId: 4, rating: 5, comment: 'Giao nhanh' }));
    expect(await screen.findByText('Đã gửi đánh giá.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi đánh giá' })).not.toBeInTheDocument();
});

test('delivered orders without an assigned shipper cannot be rated; detail handles deleted products and voucher', async () => {
    getAllOrdersByUser.mockResolvedValue(response([order(6, 'S6', { canRateShipper: true, orderDetail: [{ id: 60, realPrice: 100000, quantity: 1 }] })]));
    render(<OrderUser />);
    fireEvent.click(await screen.findByRole('button', { name: 'Xem chi tiết' }));
    expect(screen.getByRole('heading', { name: 'Sản phẩm' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi đánh giá' })).not.toBeInTheDocument();
});

test('returning to the page refreshes orders once and preserves expanded details on slow or failed refresh', async () => {
    getAllOrdersByUser.mockResolvedValueOnce(response([order(1, 'S3')]));
    let rejectRefresh;
    getAllOrdersByUser.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectRefresh = reject; }));
    render(<OrderUser />);
    const card = await screen.findByRole('article', { name: 'Đơn hàng 1' });
    fireEvent.click(within(card).getByRole('button', { name: 'Xem chi tiết' }));
    fireEvent.focus(window);
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(getAllOrdersByUser).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('article', { name: 'Đơn hàng 1' })).toBe(card);
    expect(within(card).getByRole('heading', { name: 'Sản phẩm' })).toBeInTheDocument();
    expect(card).toHaveAttribute('aria-busy', 'true');
    await act(async () => rejectRefresh(new Error('Không cập nhật được')));
    expect(screen.getByRole('alert')).toHaveTextContent('Không cập nhật được');
    expect(screen.getByRole('article', { name: 'Đơn hàng 1' })).toBe(card);
});

test('a committed status is shown immediately without removing products while a fresh reload is pending', async () => {
    const pendingOrder = order(1, 'S3', { statusOrderData: { value: 'Chờ xác nhận' } });
    getAllOrdersByUser.mockResolvedValueOnce(response([pendingOrder])).mockReturnValueOnce(new Promise(() => {}));
    updateStatusOrderService.mockResolvedValueOnce({ errCode: 0, data: { id: 1, statusId: 'S7', cancellationReason: 'Đặt nhầm sản phẩm' } });
    render(<OrderUser />);
    const card = await screen.findByRole('article', { name: 'Đơn hàng 1' });
    fireEvent.click(within(card).getByRole('button', { name: 'Hủy đơn' }));
    fireEvent.change(within(card).getByLabelText('Lý do hủy đơn'), { target: { value: 'Đặt nhầm sản phẩm' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Xác nhận hủy đơn' }));
    expect(await within(card).findByText('Đã hủy')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Đơn hàng 1' })).toBe(card);
    expect(within(card).getByText('Áo mẫu × 1')).toBeInTheDocument();
    expect(getAllOrdersByUser).toHaveBeenLastCalledWith(7, expect.objectContaining({ fresh: true, signal: expect.any(AbortSignal) }));
});
