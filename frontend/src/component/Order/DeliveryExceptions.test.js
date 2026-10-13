import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DeliveryExceptions from './DeliveryExceptions';
import * as operations from '../../services/orderOperationsService';

jest.mock('../../services/orderOperationsService', () => ({ reportDeliveryFailure: jest.fn(), retryDelivery: jest.fn(), startReturnToWarehouse: jest.fn(), receiveUndeliveredReturn: jest.fn() }));
const order = { id: 5, statusId: 'S5', shipperId: 9, deliveryProvider: 'internal' };
beforeEach(() => { jest.clearAllMocks(); Object.values(operations).filter(jest.isMockFunction).forEach(mock => mock.mockResolvedValue({ errCode: 0 })); });

test('external shipments and unassigned orders cannot use internal delivery actions', () => {
    const { rerender } = render(<DeliveryExceptions order={{ ...order, shipment: { provider: 'ghn' } }} admin />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    rerender(<DeliveryExceptions order={{ ...order, shipperId: null }} admin />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

test('delivery failure requires a reason, handles rejection, then reloads authoritative state', async () => {
    operations.reportDeliveryFailure.mockResolvedValueOnce({ errCode: 2, errMessage: 'Đơn không còn đang giao' });
    const updated = jest.fn();
    render(<DeliveryExceptions order={order} onUpdated={updated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Báo giao không thành công' }));
    expect(screen.getByRole('button', { name: 'Ghi nhận giao thất bại' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Lý do giao thất bại'), { target: { value: ' Khách hẹn giao ngày mai ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận giao thất bại' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Đơn không còn đang giao');
    expect(updated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận giao thất bại' }));
    await waitFor(() => expect(updated).toHaveBeenCalledTimes(1));
    expect(operations.reportDeliveryFailure).toHaveBeenLastCalledWith({ orderId: 5, reason: 'Khách hẹn giao ngày mai' });
});

test('a failed delivery can be retried only after confirmation or returned with a reason', async () => {
    render(<DeliveryExceptions order={{ ...order, statusId: 'S8' }} />);
    expect(screen.getByText(/tiền COD chưa được ghi nhận đã thu/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Giao lại đơn hàng' }));
    expect(operations.retryDelivery).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận bắt đầu giao lại' }));
    await waitFor(() => expect(operations.retryDelivery).toHaveBeenCalledWith({ orderId: 5 }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đưa hàng về kho' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Đưa hàng về kho' }));
    fireEvent.change(screen.getByLabelText('Lý do hoàn về kho'), { target: { value: 'Khách từ chối nhận' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đưa về kho' }));
    await waitFor(() => expect(operations.startReturnToWarehouse).toHaveBeenCalledWith({ orderId: 5, reason: 'Khách từ chối nhận' }));
});

test('only admin can confirm the warehouse received undelivered goods', async () => {
    const { rerender } = render(<DeliveryExceptions order={{ ...order, statusId: 'S9' }} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<DeliveryExceptions order={{ ...order, statusId: 'S9' }} admin />);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm nhận đơn giao thất bại' }));
    fireEvent.change(screen.getByLabelText('Biên bản kiểm hàng'), { target: { value: 'Đủ hàng, sản phẩm đã hỏng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận kho đã nhận hàng' }));
    await waitFor(() => expect(operations.receiveUndeliveredReturn).toHaveBeenCalledWith({ orderId: 5, inspectionNote: 'Đủ hàng, sản phẩm đã hỏng', resellable: false }));
});
