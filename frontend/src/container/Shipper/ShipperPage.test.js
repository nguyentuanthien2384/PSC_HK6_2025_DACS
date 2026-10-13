import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShipperPage, { DeliveryForm } from './ShipperPage';
import { assignShippingOrder, completeShippingOrder, getAvailableShippingOrders, getShipperOrders } from '../../services/shippingService';
import { reportDeliveryFailure } from '../../services/orderOperationsService';

jest.mock('../../services/shippingService', () => ({ assignShippingOrder: jest.fn(), completeShippingOrder: jest.fn(), getAvailableShippingOrders: jest.fn(), getShipperOrders: jest.fn(), rateShipper: jest.fn() }));
jest.mock('../../utils/token', () => ({ getUser: () => ({ id: 9, roleId: 'R3' }) }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../services/orderOperationsService', () => ({ reportDeliveryFailure: jest.fn(), retryDelivery: jest.fn(), startReturnToWarehouse: jest.fn(), receiveUndeliveredReturn: jest.fn() }));
const order = { id: 3, statusId: 'S4', shipperId: null, totalPrice: 150000, isPaymentOnlien: 0, addressUser: { shipName: 'Khách hàng', shipAdress: 'Hà Nội', shipPhonenumber: '0901234567' }, orderDetail: [] };
const result = (data = [], summary = {}) => ({ errCode: 0, data, summary: { working: 0, done: 0, ratingCount: 0, ratingAverage: 0, ...summary } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const workingOrder = { ...order, statusId: 'S5', shipperId: 9, orderDetail: [{ id: 12, quantity: 1, realPrice: 150000, product: { name: 'Áo giao hàng' } }] };

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

test('active orders render without waiting for slow history or a failed available list', async () => {
    const history = deferred();
    getAvailableShippingOrders.mockRejectedValue(new Error('Không thể tải đơn chờ nhận'));
    getShipperOrders.mockImplementation(status => status === 'done' ? history.promise : Promise.resolve(result([workingOrder], { working: 1 })));
    render(<ShipperPage />);
    expect(await screen.findByRole('article', { name: 'Đơn giao hàng 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận giao hàng' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Đơn chờ nhận/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải đơn chờ nhận');
});

test('refresh preserves the expanded product card and keeps it after a transient error', async () => {
    getShipperOrders.mockImplementation(status => Promise.resolve(result(status === 'working' ? [workingOrder] : [], { working: 1 })));
    render(<ShipperPage />);
    await screen.findByRole('article', { name: 'Đơn giao hàng 3' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Làm mới' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
    const refresh = deferred();
    getShipperOrders.mockImplementation(status => status === 'working' ? refresh.promise : Promise.resolve(result([])));
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    expect(screen.getByText('Áo giao hàng')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-busy', 'true');
    await act(async () => refresh.resolve({ errCode: 2, errMessage: 'Tạm thời mất kết nối' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tạm thời mất kết nối');
    expect(screen.getByText('Áo giao hàng')).toBeInTheDocument();
});

test('successful delivery moves the server-confirmed order immediately even while refresh is pending', async () => {
    const oldHistory = deferred();
    getShipperOrders.mockImplementation(status => status === 'done' ? oldHistory.promise : Promise.resolve(result([workingOrder], { working: 1 })));
    completeShippingOrder.mockResolvedValue({ errCode: 0, data: { id: 3, statusId: 'S6', shipperId: 9, deliveredAt: '2026-10-13T04:00:00Z' } });
    render(<ShipperPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận giao hàng' }));
    const refresh = deferred();
    getShipperOrders.mockReturnValue(refresh.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Đã giao thành công' }));
    expect(await screen.findByText('Đã giao hàng')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Lịch sử giao hàng' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
    expect(screen.getByText('Áo giao hàng')).toBeInTheDocument();
    await act(async () => oldHistory.resolve(result([])));
    expect(screen.getByText('Áo giao hàng')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Đơn giao hàng 3' })).toBeInTheDocument();
});

test('delivery failure immediately updates the card without hiding its products or waiting for refresh', async () => {
    getShipperOrders.mockImplementation(status => Promise.resolve(result(status === 'working' ? [workingOrder] : [], { working: 1 })));
    reportDeliveryFailure.mockResolvedValue({ errCode: 0, data: { id: 3, statusId: 'S8', shipperId: 9, deliveryAttempts: 1, lastDeliveryFailureReason: 'Khách hẹn lại' } });
    render(<ShipperPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Xem chi tiết' }));
    fireEvent.click(screen.getByRole('button', { name: 'Báo giao không thành công' }));
    fireEvent.change(screen.getByLabelText('Lý do giao thất bại'), { target: { value: 'Khách hẹn lại' } });
    const refresh = deferred();
    getShipperOrders.mockReturnValue(refresh.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận giao thất bại' }));
    expect(await screen.findByText('Giao không thành công')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Giao lại đơn hàng' })).toBeEnabled());
    expect(screen.getByText('Áo giao hàng')).toBeInTheDocument();
    expect(screen.getByText('Giao không thành công: Khách hẹn lại')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận giao hàng' })).not.toBeInTheDocument();
});

test('entering the delivery page again fetches current orders with abortable reads', async () => {
    const first = render(<ShipperPage />);
    await screen.findByText(/Bạn chưa có đơn đang giao/);
    first.unmount();
    getShipperOrders.mockImplementation(status => Promise.resolve(result(status === 'working' ? [workingOrder] : [])));
    render(<ShipperPage />);
    expect(await screen.findByRole('article', { name: 'Đơn giao hàng 3' })).toBeInTheDocument();
    expect(getShipperOrders.mock.calls.filter(([status]) => status === 'working')).toHaveLength(2);
    expect(getShipperOrders).toHaveBeenLastCalledWith('done', expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

test('one delivery mutation blocks contradictory completion and failure actions', async () => {
    getShipperOrders.mockImplementation(status => Promise.resolve(result(status === 'working' ? [workingOrder] : [])));
    const failure = deferred();
    reportDeliveryFailure.mockReturnValue(failure.promise);
    render(<ShipperPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận giao hàng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Báo giao không thành công' }));
    fireEvent.change(screen.getByLabelText('Lý do giao thất bại'), { target: { value: 'Không liên lạc được khách' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận giao thất bại' }));
    expect(screen.getByRole('button', { name: 'Đang cập nhật…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Đang cập nhật…' }));
    expect(completeShippingOrder).not.toHaveBeenCalled();
    await act(async () => failure.resolve({ errCode: 2, errMessage: 'Thử lại sau' }));
    expect(await screen.findByText('Thử lại sau')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đã giao thành công' })).toBeEnabled();
});
