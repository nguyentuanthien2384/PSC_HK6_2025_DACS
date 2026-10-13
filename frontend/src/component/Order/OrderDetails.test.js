import React from 'react';
import { render, screen } from '@testing-library/react';
import OrderDetails from './OrderDetails';

const order = { id: 12, statusId: 'S6', isPaymentOnlien: 1, totalPrice: 120000, orderDetail: [] };

test('demo payment orders have a clear simulation notice instead of a verified payment claim', () => {
    render(<OrderDetails order={{ ...order, paymentSession: { provider: 'paypal', status: 'COMPLETED', isDemo: true } }} />);
    expect(screen.getByRole('note')).toHaveTextContent('không phải giao dịch đã xác minh tại cổng thanh toán');
    expect(screen.getByText('Thanh toán: Dữ liệu thanh toán demo / mô phỏng')).toBeInTheDocument();
    expect(screen.queryByText('Thanh toán: Đã thanh toán trực tuyến')).not.toBeInTheDocument();
});

test('real persisted online orders keep the verified payment display', () => {
    render(<OrderDetails order={{ ...order, paymentSession: { provider: 'paypal', status: 'COMPLETED', isDemo: false } }} />);
    expect(screen.getByText('Thanh toán: Đã thanh toán trực tuyến')).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
});
