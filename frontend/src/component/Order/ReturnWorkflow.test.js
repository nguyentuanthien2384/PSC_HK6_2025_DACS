import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReturnWorkflow from './ReturnWorkflow';
import * as operations from '../../services/orderOperationsService';

jest.mock('../../services/orderOperationsService', () => ({
    createReturnRequest: jest.fn(), reviewReturnRequest: jest.fn(), markReturnShipped: jest.fn(), receiveReturn: jest.fn(), confirmManualRefund: jest.fn(), requestOnlineRefund: jest.fn(),
}));
const order = { id: 12, statusId: 'S6', isPaymentOnlien: 0, returnEligibility: { canRequest: true, windowDays: 7 }, returnRequest: null };
const returned = (status, extra = {}) => ({ ...order, returnRequest: { id: 87, status, reason: 'Hàng bị lỗi', amount: 120000, ...extra } });
beforeEach(() => { jest.clearAllMocks(); Object.values(operations).filter(jest.isMockFunction).forEach(mock => mock.mockResolvedValue({ errCode: 0 })); });

test.each([
    ['REQUESTED', false, null], ['APPROVED', false, 'Nhập vận đơn gửi trả'], ['SHIPPED', false, null], ['REFUND_PENDING', false, null], ['REFUNDED', false, null],
    ['REQUESTED', true, 'Duyệt trả hàng'], ['APPROVED', true, null], ['SHIPPED', true, 'Kiểm nhận hàng trả tại kho'], ['REFUND_PENDING', true, 'Ghi nhận hoàn tiền COD'], ['REFUNDED', true, null],
])('return %s offers the correct action for admin=%s', (status, admin, label) => {
    render(<ReturnWorkflow order={{ ...returned(status), returnEligibility: { canRequest: false } }} admin={admin} />);
    expect(screen.getByText('Lý do: Hàng bị lỗi')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: label || /./ })).toHaveLength(label ? 1 : 0);
});

test('the server controls return eligibility and rejection can only be retried while eligible', () => {
    const { rerender } = render(<ReturnWorkflow order={{ ...order, returnEligibility: { canRequest: false, reason: 'Đã quá hạn trả hàng' } }} />);
    expect(screen.getByText('Đã quá hạn trả hàng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yêu cầu trả hàng' })).not.toBeInTheDocument();
    rerender(<ReturnWorkflow order={returned('REJECTED')} />);
    expect(screen.getByRole('button', { name: 'Yêu cầu trả hàng' })).toBeEnabled();
});

test('customer request needs a reason; an API rejection preserves input for retry', async () => {
    const updated = jest.fn();
    operations.createReturnRequest.mockResolvedValueOnce({ errCode: 2, errMessage: 'Đơn đã hết hạn trả hàng' });
    render(<ReturnWorkflow order={order} onUpdated={updated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yêu cầu trả hàng' }));
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu trả hàng' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Lý do trả hàng'), { target: { value: '  Sản phẩm bị lỗi  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Đơn đã hết hạn trả hàng');
    expect(updated).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Lý do trả hàng')).toHaveValue('  Sản phẩm bị lỗi  ');
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }));
    await waitFor(() => expect(updated).toHaveBeenCalledTimes(1));
    expect(operations.createReturnRequest).toHaveBeenLastCalledWith({ orderId: 12, reason: 'Sản phẩm bị lỗi' });
    expect(screen.getByRole('status')).toHaveTextContent('chờ cửa hàng duyệt');
});

test('approval sends actual warehouse instructions and customer supplies actual return tracking', async () => {
    const { rerender } = render(<ReturnWorkflow order={returned('REQUESTED')} admin />);
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt trả hàng' }));
    fireEvent.change(screen.getByLabelText('Địa chỉ kho và hướng dẫn gửi trả'), { target: { value: ' Kho 10 phố Huế, gửi đủ phụ kiện ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận duyệt trả hàng' }));
    await waitFor(() => expect(operations.reviewReturnRequest).toHaveBeenCalledWith({ orderId: 12, decision: 'APPROVE', note: 'Kho 10 phố Huế, gửi đủ phụ kiện' }));
    rerender(<ReturnWorkflow order={returned('APPROVED')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nhập vận đơn gửi trả' }));
    expect(screen.getByRole('button', { name: 'Xác nhận đã gửi hàng trả' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Hãng vận chuyển trả hàng'), { target: { value: ' GHN ' } });
    fireEvent.change(screen.getByLabelText('Mã vận đơn trả hàng'), { target: { value: ' RETURN-2026 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã gửi hàng trả' }));
    await waitFor(() => expect(operations.markReturnShipped).toHaveBeenCalledWith({ orderId: 12, carrier: 'GHN', trackingNumber: 'RETURN-2026' }));
});

test('warehouse receipt requires inspection and preserves pending refund until payment settlement', async () => {
    render(<ReturnWorkflow order={returned('SHIPPED')} admin />);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm nhận hàng trả tại kho' }));
    expect(screen.getByRole('button', { name: 'Xác nhận kho đã nhận hàng' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Biên bản kiểm hàng'), { target: { value: ' Đủ hàng, bao bì còn nguyên ' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Toàn bộ hàng đủ điều kiện bán lại' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận kho đã nhận hàng' }));
    await waitFor(() => expect(operations.receiveReturn).toHaveBeenCalledWith({ orderId: 12, inspectionNote: 'Đủ hàng, bao bì còn nguyên', resellable: true }));
    expect(await screen.findByRole('status')).toHaveTextContent('Khoản hoàn đang chờ xử lý');
    expect(screen.queryByText('Đã hoàn tiền')).not.toBeInTheDocument();
});

test('COD refund requires an actual transaction reference and valid payment proof', async () => {
    render(<ReturnWorkflow order={returned('REFUND_PENDING')} admin />);
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận hoàn tiền COD' }));
    fireEvent.change(screen.getByLabelText('Mã giao dịch / số phiếu hoàn tiền'), { target: { value: ' BANK-9821 ' } });
    expect(screen.getByRole('button', { name: 'Ghi nhận tiền đã hoàn' })).toBeDisabled();
    const proof = screen.getByLabelText('Chứng từ hoàn tiền (bắt buộc)');
    fireEvent.change(proof, { target: { files: [new File(['x'], 'fake.pdf', { type: 'application/pdf' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Chọn ảnh');
    fireEvent.change(proof, { target: { files: [new File(['receipt'], 'receipt.png', { type: 'image/png' })] } });
    await screen.findByAltText('Chứng từ hoàn tiền (bắt buộc)');
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận tiền đã hoàn' }));
    await waitFor(() => expect(operations.confirmManualRefund).toHaveBeenCalledWith({ orderId: 12, paymentReference: 'BANK-9821', paymentProof: expect.stringMatching(/^data:image\/png;base64,/) }));
});

test('online refund uses return request id and only verified settlement announces success', async () => {
    operations.requestOnlineRefund.mockResolvedValueOnce({ errCode: 0, data: { status: 'REFUND_PENDING' }, refund: { status: 'PENDING' } });
    operations.requestOnlineRefund.mockResolvedValueOnce({ errCode: 0, data: { status: 'REFUNDED' } });
    render(<ReturnWorkflow order={{ ...returned('REFUND_PENDING'), isPaymentOnlien: 1 }} admin />);
    fireEvent.click(screen.getByRole('button', { name: 'Yêu cầu hoàn tiền trực tuyến' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Chưa có xác nhận tiền đã hoàn');
    expect(operations.requestOnlineRefund).toHaveBeenCalledWith(87);
    expect(screen.queryByText('Cổng thanh toán đã xác nhận hoàn tiền thành công.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yêu cầu hoàn tiền trực tuyến' }));
    expect(await screen.findByText('Cổng thanh toán đã xác nhận hoàn tiền thành công.')).toBeInTheDocument();
});

test('a late return result cannot update another selected order', async () => {
    let resolve;
    operations.requestOnlineRefund.mockReturnValue(new Promise(done => { resolve = done; }));
    const updated = jest.fn();
    const { rerender } = render(<ReturnWorkflow order={{ ...returned('REFUND_PENDING'), isPaymentOnlien: 1 }} admin onUpdated={updated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yêu cầu hoàn tiền trực tuyến' }));
    rerender(<ReturnWorkflow order={{ ...order, id: 13 }} admin onUpdated={updated} />);
    await act(async () => resolve({ errCode: 0, data: { status: 'REFUNDED' } }));
    expect(updated).not.toHaveBeenCalled();
    expect(screen.queryByText('Cổng thanh toán đã xác nhận hoàn tiền thành công.')).not.toBeInTheDocument();
});

test('demo online payment orders explain the limitation and cannot request gateway refunds', () => {
    render(<ReturnWorkflow order={{ ...returned('REFUND_PENDING'), isPaymentOnlien: 1, paymentSession: { isDemo: true } }} admin />);
    expect(screen.getByRole('note')).toHaveTextContent('Không thể yêu cầu hoàn tiền qua cổng thanh toán');
    expect(screen.queryByRole('button', { name: 'Yêu cầu hoàn tiền trực tuyến' })).not.toBeInTheDocument();
    expect(operations.requestOnlineRefund).not.toHaveBeenCalled();
});
