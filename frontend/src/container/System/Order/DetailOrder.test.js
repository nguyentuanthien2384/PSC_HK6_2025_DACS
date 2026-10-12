import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DetailOrder from './DetailOrder';
import { getDetailOrder, updateStatusOrderService } from '../../../services/userService';
import { assignShippingOrder, completeShippingOrder, getActiveShippers } from '../../../services/shippingService';
let mockOrderId = '3';

jest.mock('react-router-dom', () => ({ Link: ({ children, to }) => <a href={to}>{children}</a>, useParams: () => ({ id: mockOrderId }) }), { virtual: true });
jest.mock('../../../services/userService', () => ({ getDetailOrder: jest.fn(), updateStatusOrderService: jest.fn() }));
jest.mock('../../../services/shippingService', () => ({ assignShippingOrder: jest.fn(), completeShippingOrder: jest.fn(), getActiveShippers: jest.fn(), rateShipper: jest.fn() }));
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
