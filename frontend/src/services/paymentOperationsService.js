import axios from '../axios';

export const getPaymentReconciliation = ({ limit = 50, offset = 0 } = {}) => axios.get('/api/payments/reconciliation', { params: { limit, offset } });
export const reconcilePayment = sessionId => axios.post('/api/payments/reconcile', { sessionId });
export const getPaymentRefunds = ({ limit = 50, offset = 0 } = {}) => axios.get('/api/payments/refunds', { params: { limit, offset } });
export const retryPaymentRefund = id => axios.post(`/api/payments/refunds/${id}/retry`, {});
export const refundPaymentSession = data => axios.post('/api/payments/refund-session', data);
