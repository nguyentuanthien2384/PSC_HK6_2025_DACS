import { formatProviderAmount, isDemoPayment } from './payments';

test('demo payment flags and provider ids identify simulated sessions and refunds', () => {
    expect(isDemoPayment({ isDemo: true })).toBe(true);
    expect(isDemoPayment({ providerPaymentId: 'DEMO-paypal-2' })).toBe(true);
    expect(isDemoPayment({ providerRefundId: 'demo-refund-2' })).toBe(true);
    expect(isDemoPayment({ providerPaymentId: 'PAYPAL-REAL-2', status: 'COMPLETED' })).toBe(false);
});

test('VNPay stores amounts in one hundredth units while PayPal keeps its decimal currency amount', () => {
    expect(formatProviderAmount({ provider: 'vnpay', providerAmount: '62000000', currency: 'VND' })).toBe('620.000 VND');
    expect(formatProviderAmount({ provider: 'paypal', providerAmount: '25.50', currency: 'USD' })).toBe('25.50 USD');
});

test('invalid provider values cannot be coerced into fake zero amounts', () => {
    for (const value of ['', null, undefined, 'invalid', 'NaN', -1, Infinity, '62000000.00', '62000001']) {
        expect(formatProviderAmount({ provider: 'vnpay', providerAmount: value, currency: 'VND' })).toBeNull();
    }
    expect(formatProviderAmount({ provider: 'paypal', providerAmount: '', currency: 'USD' })).toBeNull();
});
