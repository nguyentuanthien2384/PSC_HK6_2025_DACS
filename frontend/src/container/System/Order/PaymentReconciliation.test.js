import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PaymentReconciliation from './PaymentReconciliation';
import * as operations from '../../../services/paymentOperationsService';

jest.mock('react-router-dom', () => ({ Link: ({ children, to }) => <a href={to}>{children}</a> }), { virtual: true });
jest.mock('../../../services/paymentOperationsService', () => ({ getPaymentReconciliation: jest.fn(), reconcilePayment: jest.fn(), getPaymentRefunds: jest.fn(), retryPaymentRefund: jest.fn(), refundPaymentSession: jest.fn() }));
const session = { id: 'session-12', provider: 'paypal', status: 'PENDING', totalPrice: 240000, providerAmount: '10.00', currency: 'USD', orderId: null };
const refund = { id: 'refund-12', provider: 'paypal', status: 'PENDING', amountVnd: 240000, providerAmount: '10.00', currency: 'USD', orderId: 12 };
const result = data => ({ errCode: 0, data, count: data.length });
beforeEach(() => {
    jest.clearAllMocks();
    operations.getPaymentReconciliation.mockResolvedValue({ ...result([session]), readiness: { paypal: { configured: false, mode: 'sandbox', webhookConfigured: false }, vnpay: { configured: false, mode: 'sandbox', ipnUrlConfigured: false } } });
    operations.getPaymentRefunds.mockResolvedValue(result([refund]));
    operations.reconcilePayment.mockResolvedValue({ errCode: 0, status: 'PENDING' });
    operations.retryPaymentRefund.mockResolvedValue({ errCode: 0, status: 'PENDING' });
    operations.refundPaymentSession.mockResolvedValue({ errCode: 0, status: 'PENDING' });
});

test('configuration and persisted transactions are shown without implying merchant readiness', async () => {
    render(<PaymentReconciliation />);
    expect(await screen.findByRole('article', { name: 'Giao dịch session-12' })).toHaveTextContent('240.000');
    expect(screen.getByRole('article', { name: 'Giao dịch session-12' })).toHaveTextContent('Cổng: 10.00 USD');
    expect(screen.getAllByText(/Chưa có khóa merchant/)).toHaveLength(2);
    expect(screen.getByText(/Chưa cấu hình webhook/)).toBeInTheDocument();
    expect(screen.getByText(/Chưa cấu hình địa chỉ IPN/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tiền phiên chưa tạo đơn' })).not.toBeInTheDocument();
    expect(operations.getPaymentReconciliation).toHaveBeenCalledWith({ limit: 50, offset: 0 });
});

test('payment verification error preserves the session and pending verification never announces success', async () => {
    operations.reconcilePayment.mockResolvedValueOnce({ errCode: 3, errMessage: 'Chữ ký không hợp lệ' });
    render(<PaymentReconciliation />);
    fireEvent.click(await screen.findByRole('button', { name: 'Xác minh với cổng thanh toán' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chữ ký không hợp lệ');
    expect(operations.getPaymentReconciliation).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh với cổng thanh toán' }));
    expect(await screen.findByText('Kết quả từ cổng thanh toán: Đang chờ xác minh.')).toBeInTheDocument();
    expect(operations.reconcilePayment).toHaveBeenLastCalledWith('session-12');
    expect(screen.queryByText('Đã xác nhận thành công')).not.toBeInTheDocument();
});

test('only a paid orphaned review session can request a refund and reason is required', async () => {
    operations.getPaymentReconciliation.mockResolvedValue(result([
        { ...session, id: 'paid-orphan', status: 'REVIEW_REQUIRED', paidAt: '2026-10-12T04:00:00Z' },
        { ...session, id: 'not-paid', status: 'REVIEW_REQUIRED' },
        { ...session, id: 'has-order', status: 'REVIEW_REQUIRED', orderId: 12, paidAt: '2026-10-12T04:00:00Z' },
    ]));
    render(<PaymentReconciliation />);
    const button = await screen.findByRole('button', { name: 'Hoàn tiền phiên chưa tạo đơn' });
    expect(screen.getAllByRole('button', { name: 'Hoàn tiền phiên chưa tạo đơn' })).toHaveLength(1);
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu hoàn tiền phiên' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Lý do hoàn tiền phiên'), { target: { value: ' Phiên hết hạn sau khi khách trả tiền ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu hoàn tiền phiên' }));
    await waitFor(() => expect(operations.refundPaymentSession).toHaveBeenCalledWith({ sessionId: 'paid-orphan', reason: 'Phiên hết hạn sau khi khách trả tiền' }));
    expect(await screen.findByText('Kết quả từ cổng thanh toán: Đang chờ xác minh.')).toBeInTheDocument();
});

test('refund reconciliation stays pending until the provider verifies completion', async () => {
    render(<PaymentReconciliation />);
    await screen.findByRole('article');
    fireEvent.click(screen.getByRole('tab', { name: 'Khoản hoàn tiền' }));
    const item = await screen.findByRole('article', { name: 'Khoản hoàn refund-12' });
    expect(within(item).getByRole('link', { name: 'Xem đơn #12' })).toHaveAttribute('href', '/system/home/order-detail/12');
    fireEvent.click(within(item).getByRole('button', { name: 'Đối soát / thử lại hoàn tiền' }));
    expect(await screen.findByText('Kết quả từ cổng thanh toán: Đang chờ xác minh.')).toBeInTheDocument();
    expect(screen.queryByText('Đã xác nhận thành công')).not.toBeInTheDocument();
    operations.retryPaymentRefund.mockResolvedValue({ errCode: 0, status: 'COMPLETED' });
    operations.getPaymentRefunds.mockResolvedValue(result([{ ...refund, status: 'COMPLETED', completedAt: '2026-10-12T04:00:00Z' }]));
    fireEvent.click(screen.getByRole('button', { name: 'Đối soát / thử lại hoàn tiền' }));
    await screen.findByText('Kết quả từ cổng thanh toán: Đã xác nhận thành công.');
    expect(screen.queryByRole('button', { name: 'Đối soát / thử lại hoàn tiền' })).not.toBeInTheDocument();
});

test('changing reconciliation tabs clears an open orphan refund form', async () => {
    operations.getPaymentReconciliation.mockResolvedValue(result([{ ...session, status: 'REVIEW_REQUIRED', paidAt: '2026-10-12T04:00:00Z' }]));
    render(<PaymentReconciliation />);
    fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tiền phiên chưa tạo đơn' }));
    fireEvent.change(screen.getByLabelText('Lý do hoàn tiền phiên'), { target: { value: 'Lý do phiên trước' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Khoản hoàn tiền' }));
    await screen.findByRole('article', { name: 'Khoản hoàn refund-12' });
    fireEvent.click(screen.getByRole('tab', { name: 'Giao dịch thanh toán' }));
    await screen.findByRole('article', { name: 'Giao dịch session-12' });
    expect(screen.queryByLabelText('Lý do hoàn tiền phiên')).not.toBeInTheDocument();
});

test('seeded demo sessions and their refunds are labelled as simulations and never offer gateway mutations', async () => {
    operations.getPaymentReconciliation.mockResolvedValue(result([
        { ...session, id: 'demo-completed', status: 'COMPLETED', providerPaymentId: 'DEMO-paypal-2' },
        { ...session, id: 'demo-review', status: 'REVIEW_REQUIRED', providerPaymentId: 'DEMO-vnpay-5', paidAt: '2026-10-12T04:00:00Z' },
    ]));
    operations.getPaymentRefunds.mockResolvedValue(result([
        { ...refund, id: 'demo-refund', providerRefundId: 'DEMO-REFUND-2' },
        { ...refund, id: 'demo-session-refund', isDemo: true },
    ]));
    render(<PaymentReconciliation />);
    const completed = await screen.findByRole('article', { name: 'Giao dịch demo-completed' });
    expect(within(completed).getByRole('note')).toHaveTextContent('không phải giao dịch cổng thanh toán');
    expect(within(completed).queryByText('Đã xác nhận thành công')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác minh với cổng thanh toán' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tiền phiên chưa tạo đơn' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Khoản hoàn tiền' }));
    await screen.findByRole('article', { name: 'Khoản hoàn demo-session-refund' });
    expect(screen.getAllByRole('note')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Đối soát / thử lại hoàn tiền' })).not.toBeInTheDocument();
    expect(operations.reconcilePayment).not.toHaveBeenCalled();
    expect(operations.refundPaymentSession).not.toHaveBeenCalled();
    expect(operations.retryPaymentRefund).not.toHaveBeenCalled();
});

test('VNPay amounts are converted from protocol minor units to VND; malformed amounts are not rendered as zero', async () => {
    operations.getPaymentReconciliation.mockResolvedValue(result([
        { ...session, id: 'vnpay-units', provider: 'vnpay', totalPrice: 620000, providerAmount: '62000000', currency: 'VND' },
        { ...session, id: 'vnpay-invalid', provider: 'vnpay', providerAmount: 'invalid', currency: 'VND' },
    ]));
    render(<PaymentReconciliation />);
    const valid = await screen.findByRole('article', { name: 'Giao dịch vnpay-units' });
    expect(valid).toHaveTextContent('Cổng: 620.000 VND');
    expect(valid).not.toHaveTextContent('62000000 VND');
    const invalid = screen.getByRole('article', { name: 'Giao dịch vnpay-invalid' });
    expect(invalid).not.toHaveTextContent('Cổng:');
    expect(invalid).not.toHaveTextContent('NaN');
    expect(invalid).toHaveTextContent('Đang chờ xác minh');
});
