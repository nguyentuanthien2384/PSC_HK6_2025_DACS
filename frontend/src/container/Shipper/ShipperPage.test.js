import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShipperPage, { DeliveryForm } from './ShipperPage';
import { assignShippingOrder, completeShippingOrder, getAvailableShippingOrders, getShipperOrders } from '../../services/shippingService';

jest.mock('../../services/shippingService', () => ({ assignShippingOrder: jest.fn(), completeShippingOrder: jest.fn(), getAvailableShippingOrders: jest.fn(), getShipperOrders: jest.fn(), rateShipper: jest.fn() }));
jest.mock('../../utils/token', () => ({ getUser: () => ({ id: 9, roleId: 'R3' }) }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const order = { id: 3, statusId: 'S4', shipperId: null, totalPrice: 150000, isPaymentOnlien: 0, addressUser: { shipName: 'Khách hàng', shipAdress: 'Hà Nội', shipPhonenumber: '0901234567' }, orderDetail: [] };
const result = (data = [], summary = {}) => ({ errCode: 0, data, summary: { working: 0, done: 0, ratingCount: 0, ratingAverage: 0, ...summary } });

beforeEach(() => { jest.clearAllMocks(); getAvailableShippingOrders.mockResolvedValue(result([])); getShipperOrders.mockResolvedValue(result([])); assignShippingOrder.mockResolvedValue(result()); completeShippingOrder.mockResolvedValue(result()); });

test('an empty account has no delivery action and offers available orders only after backend confirmation', async () => {
    render(<ShipperPage />);
    expect(await screen.findByText(/Bạn chưa có đơn đang giao/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận giao hàng' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Đơn chờ nhận/ }));
    expect(screen.getByText(/Chưa có đơn hàng chờ nhận/)).toBeInTheDocument();
});

test('claim confirmation moves real available order into active work; completion moves it to history with customer rating', async () => {
    getAvailableShippingOrders.mockResolvedValue(result([order]));
    render(<ShipperPage />);
    await screen.findByText(/Bạn chưa có đơn đang giao/);
    fireEvent.click(screen.getByRole('tab', { name: /Đơn chờ nhận/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Nhận giao đơn' }));
    expect(assignShippingOrder).not.toHaveBeenCalled();
    const working = { ...order, shipperId: 9, statusId: 'S5' };
    getAvailableShippingOrders.mockResolvedValue(result([]));
    getShipperOrders.mockImplementation(status => Promise.resolve(result(status === 'working' ? [working] : [], { working: 1 })));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nhận đơn' }));
    await waitFor(() => expect(assignShippingOrder).toHaveBeenCalledWith(3));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận giao hàng' }));
    const done = { ...working, statusId: 'S6', deliveredAt: '2026-10-12T04:00:00Z', shipperRating: { rating: 4, comment: 'Đúng giờ' } };
    getShipperOrders.mockImplementation(status => Promise.resolve(result(status === 'done' ? [done] : [], { done: 1, ratingCount: 1, ratingAverage: 4 })));
    fireEvent.click(screen.getByRole('button', { name: 'Đã giao thành công' }));
    await waitFor(() => expect(completeShippingOrder).toHaveBeenCalledWith(3, ''));
    expect(await screen.findByText('Đúng giờ')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Lịch sử giao hàng' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'Xác nhận giao hàng' })).not.toBeInTheDocument();
});

test('failed claim shows error and does not fabricate an active delivery', async () => {
    getAvailableShippingOrders.mockResolvedValue(result([order]));
    assignShippingOrder.mockResolvedValue({ errCode: 2, errMessage: 'Đơn đã được nhận' });
    render(<ShipperPage />);
    await screen.findByText(/Bạn chưa có đơn đang giao/);
    fireEvent.click(screen.getByRole('tab', { name: /Đơn chờ nhận/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Nhận giao đơn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nhận đơn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Đơn đã được nhận');
    expect(screen.getByRole('tab', { name: /Đơn chờ nhận/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'Xác nhận giao hàng' })).not.toBeInTheDocument();
});

test('invalid evidence is rejected and a valid image is submitted with delivery atomically', async () => {
    const onSubmit = jest.fn();
    render(<DeliveryForm order={order} onSubmit={onSubmit} onClose={jest.fn()} />);
    const input = screen.getByLabelText('Ảnh giao hàng (không bắt buộc)');
    fireEvent.change(input, { target: { files: [new File(['x'], 'bad.pdf', { type: 'application/pdf' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Chọn ảnh');
    expect(screen.getByRole('button', { name: 'Đã giao thành công' })).toBeDisabled();
    fireEvent.change(input, { target: { files: [new File(['test-image'], 'proof.png', { type: 'image/png' })] } });
    await screen.findByAltText('Ảnh giao hàng đã chọn');
    fireEvent.click(screen.getByRole('button', { name: 'Đã giao thành công' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/));
});
