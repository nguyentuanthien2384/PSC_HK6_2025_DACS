import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CarrierShipment from './CarrierShipment';
import * as operations from '../../services/orderOperationsService';

jest.mock('../../services/orderOperationsService', () => ({ getShippingProviders: jest.fn(), bookCarrierShipment: jest.fn(), syncCarrierShipment: jest.fn(), cancelCarrierShipment: jest.fn() }));
const order = { id: 5, statusId: 'S4', shipperId: null, isPaymentOnlien: 0, deliveryProvider: 'internal' };
const provider = { id: 'ghn', name: 'Giao Hàng Nhanh', configured: true, environment: 'sandbox', supportsSandbox: true };
const shipment = { provider: 'ghn', environment: 'sandbox', trackingCode: 'GHN-REAL-RESPONSE', status: 'ready_to_pick' };
beforeEach(() => { jest.clearAllMocks(); operations.getShippingProviders.mockResolvedValue({ errCode: 0, data: [provider] }); operations.bookCarrierShipment.mockResolvedValue({ errCode: 0 }); operations.syncCarrierShipment.mockResolvedValue({ errCode: 0 }); operations.cancelCarrierShipment.mockResolvedValue({ errCode: 0 }); });
async function selectProvider() { await screen.findByRole('option', { name: /Giao Hàng Nhanh/ }); fireEvent.change(screen.getByRole('combobox', { name: 'Hãng vận chuyển' }), { target: { value: 'ghn' } }); }
function fillParcel() { [['Khối lượng (gram)', '500'], ['Dài (cm)', '20'], ['Rộng (cm)', '15'], ['Cao (cm)', '10'], ['Tỉnh/thành phố', ' Hà Nội '], ['Phường/xã', ' Bạch Mai ']].forEach(([label, value]) => fireEvent.change(screen.getByLabelText(label), { target: { value } })); }

test('customer and assigned internal orders cannot book a carrier shipment', () => {
    const { rerender } = render(<CarrierShipment order={order} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    rerender(<CarrierShipment order={{ ...order, shipperId: 9 }} admin />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(operations.getShippingProviders).not.toHaveBeenCalled();
});

test('missing merchant keys are shown as unconfigured and block booking', async () => {
    operations.getShippingProviders.mockResolvedValue({ errCode: 0, data: [{ ...provider, configured: false }] });
    render(<CarrierShipment order={order} admin />);
    await selectProvider();
    expect(screen.getByRole('status')).toHaveTextContent('Chưa thể tạo vận đơn');
    expect(screen.getByLabelText('Khối lượng (gram)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tạo vận đơn với hãng' })).toBeDisabled();
    expect(operations.bookCarrierShipment).not.toHaveBeenCalled();
});

test('booking validates actual parcel limits and submits only user input with the order id', async () => {
    const updated = jest.fn();
    render(<CarrierShipment order={order} admin onUpdated={updated} />);
    await selectProvider();
    expect(screen.getByText(/Vận đơn kiểm thử không thực hiện/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo vận đơn với hãng' })).toBeDisabled();
    fillParcel();
    fireEvent.change(screen.getByLabelText('Khối lượng (gram)'), { target: { value: '50001' } });
    expect(screen.getByRole('button', { name: 'Tạo vận đơn với hãng' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Khối lượng (gram)'), { target: { value: '500.5' } });
    expect(screen.getByRole('button', { name: 'Tạo vận đơn với hãng' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Khối lượng (gram)'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Ghi chú cho hãng'), { target: { value: ' Gọi trước khi lấy hàng ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo vận đơn với hãng' }));
    await waitFor(() => expect(updated).toHaveBeenCalledTimes(1));
    expect(operations.bookCarrierShipment).toHaveBeenCalledWith({ orderId: 5, provider: 'ghn', parcel: { weight: 500, length: 20, width: 15, height: 10 }, destination: { province: 'Hà Nội', ward: 'Bạch Mai' }, note: 'Gọi trước khi lấy hàng' });
    expect(screen.queryByText(/Mã vận đơn:/)).not.toBeInTheDocument();
});

test('a rejected booking preserves input and does not fabricate a tracking code', async () => {
    operations.bookCarrierShipment.mockResolvedValueOnce({ errCode: 3, errMessage: 'Không xác định được kết quả từ hãng, hãy đồng bộ' });
    const updated = jest.fn();
    render(<CarrierShipment order={order} admin onUpdated={updated} />);
    await selectProvider(); fillParcel();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo vận đơn với hãng' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không xác định được kết quả');
    expect(updated).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Khối lượng (gram)')).toHaveValue(500);
    expect(screen.queryByText(/Mã vận đơn:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại đơn để kiểm tra vận đơn' }));
    await waitFor(() => expect(updated).toHaveBeenCalledTimes(1));
});

test('a sandbox shipment remains clearly labelled and errors cannot mark it delivered or cancelled', async () => {
    const updated = jest.fn();
    operations.cancelCarrierShipment.mockResolvedValueOnce({ errCode: 2, errMessage: 'Hãng chưa xác nhận hủy' });
    const { rerender } = render(<CarrierShipment order={{ ...order, shipment }} admin onUpdated={updated} />);
    expect(screen.getByText('GHN · Sandbox / kiểm thử')).toBeInTheDocument();
    expect(screen.getByText('Mã vận đơn: GHN-REAL-RESPONSE')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đồng bộ trạng thái từ hãng' }));
    await waitFor(() => expect(updated).toHaveBeenCalledTimes(1));
    expect(operations.syncCarrierShipment).toHaveBeenCalledWith(5);
    fireEvent.click(screen.getByRole('button', { name: 'Hủy vận đơn đối tác' }));
    expect(operations.cancelCarrierShipment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu hủy vận đơn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Hãng chưa xác nhận hủy');
    expect(updated).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Trạng thái đối tác: Chờ lấy hàng')).toBeInTheDocument();
    rerender(<CarrierShipment order={{ ...order, id: 6, shipment: { ...shipment, environment: null } }} />);
    expect(screen.getByText('GHN · Chưa xác định môi trường')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('late booking cannot refresh the order opened after navigation', async () => {
    let resolve;
    operations.bookCarrierShipment.mockReturnValue(new Promise(done => { resolve = done; }));
    const updated = jest.fn();
    const { rerender } = render(<CarrierShipment order={order} admin onUpdated={updated} />);
    await selectProvider(); fillParcel();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo vận đơn với hãng' }));
    rerender(<CarrierShipment order={{ ...order, id: 6, statusId: 'S6' }} admin onUpdated={updated} />);
    await act(async () => resolve({ errCode: 0 }));
    expect(updated).not.toHaveBeenCalled();
});
