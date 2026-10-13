import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PaymentResult from './PaymentResult';
import { paymentOrderSuccessService, paymentOrderVnpaySuccessService } from '../services/userService';

let mockSearch = '?checkoutToken=checkout-12&token=PAYPAL-V2-ORDER';
const mockDispatch = jest.fn();
jest.mock('react-router-dom', () => ({ useLocation: () => ({ search: mockSearch }), Link: ({ children, to }) => <a href={to}>{children}</a> }), { virtual: true });
jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));
jest.mock('../services/userService', () => ({ paymentOrderSuccessService: jest.fn(), paymentOrderVnpaySuccessService: jest.fn() }));
jest.mock('../action/ShopCartAction', () => ({ ChooseVoucherStart: payload => ({ type: 'voucher/reset', payload }), getItemCartStart: id => ({ type: 'cart/load', id }) }));
jest.mock('../utils/token', () => ({ getUser: () => ({ id: 7 }) }));
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); localStorage.setItem('orderData', 'pending checkout'); mockSearch = '?checkoutToken=checkout-12&token=PAYPAL-V2-ORDER'; paymentOrderSuccessService.mockResolvedValue({ errCode: 0, status: 'COMPLETED', orderId: 12 }); paymentOrderVnpaySuccessService.mockResolvedValue({ errCode: 0, status: 'COMPLETED', orderId: 12 }); });

test('PayPal v2 return maps token to paymentId without requiring legacy PayerID', async () => {
    render(<React.StrictMode><PaymentResult provider="paypal" /></React.StrictMode>);
    expect(await screen.findByRole('heading', { name: 'Thanh toán thành công' })).toBeInTheDocument();
    expect(paymentOrderSuccessService).toHaveBeenCalledTimes(1);
    expect(paymentOrderSuccessService).toHaveBeenCalledWith({ checkoutToken: 'checkout-12', token: 'PAYPAL-V2-ORDER', paymentId: 'PAYPAL-V2-ORDER' });
    expect(localStorage.getItem('orderData')).toBeNull();
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'cart/load', id: 7 });
    expect(screen.getByRole('link', { name: 'Xem đơn hàng' })).toHaveAttribute('href', '/user/order/7');
});

test('legacy PayPal return fields remain supported', async () => {
    mockSearch = '?checkoutToken=legacy-12&paymentId=PAY-OLD&PayerID=PAYER-123';
    render(<PaymentResult provider="paypal" />);
    await screen.findByRole('heading', { name: 'Thanh toán thành công' });
    expect(paymentOrderSuccessService).toHaveBeenCalledWith({ checkoutToken: 'legacy-12', paymentId: 'PAY-OLD', PayerID: 'PAYER-123' });
});

test.each([
    { errCode: 0, status: 'REVIEW_REQUIRED', errMessage: 'Cửa hàng cần đối soát' },
    { errCode: 0, status: 'PENDING', orderId: 12 },
    { errCode: 0, status: 'COMPLETED' },
    { errCode: 3, status: 'COMPLETED', orderId: 12, errMessage: 'Chữ ký không hợp lệ' },
    { errCode: 0, status: 'COMPLETED', orderId: 12, isDemo: true },
    { errCode: 0, status: 'COMPLETED', orderId: 12, paymentSession: { providerPaymentId: 'DEMO-paypal-2' } },
])('unverified return %j cannot clear cart or report successful payment', async response => {
    paymentOrderSuccessService.mockResolvedValue(response);
    render(<PaymentResult provider="paypal" />);
    await screen.findByRole('heading', { name: 'Chưa thể xác nhận thanh toán' });
    expect(screen.queryByText('Thanh toán thành công')).not.toBeInTheDocument();
    expect(localStorage.getItem('orderData')).toBe('pending checkout');
    expect(mockDispatch).not.toHaveBeenCalled();
});

test('missing checkout session and cancellation never contact the gateway', async () => {
    mockSearch = '?token=PAYPAL-V2-ORDER';
    const { rerender } = render(<PaymentResult provider="paypal" />);
    await screen.findByText(/Không tìm thấy phiên thanh toán/);
    mockSearch = '?checkoutToken=checkout-12&cancelled=true';
    rerender(<PaymentResult provider="paypal" />);
    await screen.findByText(/Bạn đã hủy thanh toán/);
    expect(paymentOrderSuccessService).not.toHaveBeenCalled();
});

test('gateway failure permits retry and only verified completion clears pending checkout', async () => {
    paymentOrderVnpaySuccessService.mockRejectedValueOnce(new Error('Chờ IPN xác nhận'));
    render(<PaymentResult provider="vnpay" />);
    await screen.findByText('Chờ IPN xác nhận');
    expect(localStorage.getItem('orderData')).toBe('pending checkout');
    fireEvent.click(screen.getByRole('button', { name: 'Thử xác nhận lại' }));
    await screen.findByRole('heading', { name: 'Thanh toán thành công' });
    expect(paymentOrderVnpaySuccessService).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('orderData')).toBeNull();
});

test('a payment response from an old return URL cannot replace a newer return result', async () => {
    let resolve;
    paymentOrderSuccessService.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    paymentOrderSuccessService.mockResolvedValueOnce({ errCode: 2, status: 'REVIEW_REQUIRED', errMessage: 'Phiên mới cần đối soát' });
    const { rerender } = render(<PaymentResult provider="paypal" />);
    await waitFor(() => expect(paymentOrderSuccessService).toHaveBeenCalledTimes(1));
    mockSearch = '?checkoutToken=checkout-13&token=PAYPAL-13';
    rerender(<PaymentResult provider="paypal" />);
    await screen.findByText('Phiên mới cần đối soát');
    await act(async () => resolve({ errCode: 0, status: 'COMPLETED', orderId: 12 }));
    expect(screen.getByText('Phiên mới cần đối soát')).toBeInTheDocument();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(localStorage.getItem('orderData')).toBe('pending checkout');
});
