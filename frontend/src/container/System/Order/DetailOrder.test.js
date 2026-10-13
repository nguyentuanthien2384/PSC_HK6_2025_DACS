import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getShippingProviders, reportDeliveryFailure } from '../../../services/orderOperationsService';
import DetailOrder from './DetailOrder';
import { getDetailOrder, updateStatusOrderService } from '../../../services/userService';
import { assignShippingOrder, completeShippingOrder, getActiveShippers } from '../../../services/shippingService';
let mockOrderId = '3';

jest.mock('react-router-dom', () => ({ Link: ({ children, to }) => <a href={to}>{children}</a>, useParams: () => ({ id: mockOrderId }) }), { virtual: true });
jest.mock('../../../services/userService', () => ({ getDetailOrder: jest.fn(), updateStatusOrderService: jest.fn() }));
jest.mock('../../../services/shippingService', () => ({ assignShippingOrder: jest.fn(), completeShippingOrder: jest.fn(), getActiveShippers: jest.fn(), rateShipper: jest.fn() }));
jest.mock('../../../services/orderOperationsService', () => ({ getShippingProviders: jest.fn(() => Promise.resolve({ errCode: 0, data: [] })), reportDeliveryFailure: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const order = { id: 3, statusId: 'S4', shipperId: null, totalPrice: 100000, isPaymentOnlien: 0, orderDetail: [] };
beforeEach(() => { mockOrderId = '3'; jest.clearAllMocks(); getDetailOrder.mockResolvedValue({ errCode: 0, data: order }); getActiveShippers.mockResolvedValue({ errCode: 0, data: [{ id: 9, firstName: 'An', phonenumber: '0900000000' }] }); });

test('admin cannot dispatch without selecting an active shipper and dispatch uses assignment API', async () => {
    assignShippingOrder.mockResolvedValue({ errCode: 0 });
    render(<DetailOrder />);
    const assign = await screen.findByRole('button', { name: 'Phân công và gửi hàng' });
    expect(assign).toBeDisabled();
    await screen.findByRole('option', { name: 'An · 0900000000' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Người giao hàng' }), { target: { value: '9' } });
    getDetailOrder.mockResolvedValue({ errCode: 0, data: { ...order, statusId: 'S5', shipperId: 9 } });
    fireEvent.click(assign);
    await waitFor(() => expect(assignShippingOrder).toHaveBeenCalledWith(3, 9));
    expect(updateStatusOrderService).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Xác nhận giao hàng' })).toBeInTheDocument();
});

test('invalid unassigned shipping orders cannot be completed', async () => {
    getDetailOrder.mockResolvedValue({ errCode: 0, data: { ...order, statusId: 'S5' } });
    render(<DetailOrder />);
    await screen.findByRole('heading', { name: 'Đơn hàng #3' });
    expect(screen.queryByRole('button', { name: 'Xác nhận giao hàng' })).not.toBeInTheDocument();
    expect(completeShippingOrder).not.toHaveBeenCalled();
});

test('a late assignment result cannot replace the order selected by subsequent navigation', async () => {
    let resolveAssignment;
    assignShippingOrder.mockReturnValueOnce(new Promise(resolve => { resolveAssignment = resolve; }));
    const { rerender } = render(<DetailOrder />);
    await screen.findByRole('option', { name: 'An · 0900000000' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Người giao hàng' }), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Phân công và gửi hàng' }));
    mockOrderId = '4';
    getDetailOrder.mockResolvedValue({ errCode: 0, data: { ...order, id: 4, statusId: 'S6', shipperId: 9 } });
    rerender(<DetailOrder />);
    await screen.findByRole('heading', { name: 'Đơn hàng #4' });
    resolveAssignment({ errCode: 0 });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Đơn hàng #4' })).toBeInTheDocument());
    expect(getDetailOrder).toHaveBeenCalledTimes(2);
});

test('background refresh preserves dispatch input and avoids reloading provider configuration', async () => {
    let finishRefresh;
    getDetailOrder.mockResolvedValueOnce({ errCode: 0, data: order }).mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    render(<DetailOrder />);
    await screen.findByRole('option', { name: 'An · 0900000000' });
    const select = screen.getByRole('combobox', { name: 'Người giao hàng' });
    fireEvent.change(select, { target: { value: '9' } });
    fireEvent.focus(window);
    await waitFor(() => expect(getDetailOrder).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('combobox', { name: 'Người giao hàng' })).toBe(select);
    expect(select).toHaveValue('9');
    expect(select).toBeDisabled();
    expect(getShippingProviders).toHaveBeenCalledTimes(1);
    await act(async () => finishRefresh({ errCode: 0, data: { ...order } }));
    expect(select).toHaveValue('9');
    expect(select).toBeEnabled();
    expect(getActiveShippers).toHaveBeenCalledTimes(1);
    expect(getShippingProviders).toHaveBeenCalledTimes(1);
});

test('successful delivery updates the visible status before the full order reload finishes', async () => {
    getDetailOrder.mockResolvedValueOnce({ errCode: 0, data: { ...order, statusId: 'S5', shipperId: 9, statusOrderData: { value: 'Đang giao hàng' } } }).mockReturnValueOnce(new Promise(() => {}));
    completeShippingOrder.mockResolvedValueOnce({ errCode: 0, data: { id: 3, statusId: 'S6', shipperId: 9 } });
    render(<DetailOrder />);
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận giao hàng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đã giao thành công' }));
    expect(await screen.findByText('Đã giao hàng')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Đơn hàng #3' })).toBeInTheDocument();
    expect(getDetailOrder).toHaveBeenLastCalledWith('3', expect.objectContaining({ fresh: true, signal: expect.any(AbortSignal) }));
});

test('navigation aborts the previous order read and hides its details until the next order loads', async () => {
    const { rerender } = render(<DetailOrder />);
    await screen.findByRole('heading', { name: 'Đơn hàng #3' });
    const previousSignal = getDetailOrder.mock.calls[0][1].signal;
    let finishNext;
    getDetailOrder.mockImplementationOnce(() => new Promise(resolve => { finishNext = resolve; }));
    mockOrderId = '4';
    rerender(<DetailOrder />);
    expect(previousSignal.aborted).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Đơn hàng #3' })).not.toBeInTheDocument();
    await act(async () => finishNext({ errCode: 0, data: { ...order, id: 4 } }));
    expect(screen.getByRole('heading', { name: 'Đơn hàng #4' })).toBeInTheDocument();
});

test('failed delivery applies the confirmed status and keeps products while refreshing admin detail', async () => {
    getDetailOrder.mockResolvedValueOnce({ errCode: 0, data: { ...order, statusId: 'S5', shipperId: 9,
        orderDetail: [{ id: 10, quantity: 1, product: { name: 'Áo giao hàng' } }] } }).mockReturnValueOnce(new Promise(() => {}));
    reportDeliveryFailure.mockResolvedValue({ errCode: 0, data: { id: 3, statusId: 'S8', shipperId: 9, lastDeliveryFailureReason: 'Khách hẹn lại' } });
    render(<DetailOrder />);
    fireEvent.click(await screen.findByRole('button', { name: 'Báo giao không thành công' }));
    fireEvent.change(screen.getByLabelText('Lý do giao thất bại'), { target: { value: 'Khách hẹn lại' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận giao thất bại' }));
    expect(await screen.findByText('Giao không thành công')).toBeInTheDocument();
    expect(screen.getByText('Áo giao hàng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận giao hàng' })).not.toBeInTheDocument();
});
