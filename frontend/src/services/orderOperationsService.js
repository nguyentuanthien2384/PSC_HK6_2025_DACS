import axios from '../axios';

export const createReturnRequest = data => axios.post('/api/returns/request', data);
export const reviewReturnRequest = data => axios.post('/api/returns/review', data);
export const markReturnShipped = data => axios.post('/api/returns/ship', data);
export const receiveReturn = data => axios.post('/api/returns/receive', data);
export const confirmManualRefund = data => axios.post('/api/returns/refund/manual', data);
export const requestOnlineRefund = returnRequestId => axios.post(`/api/returns/${returnRequestId}/refund-online`, {});
export const reportDeliveryFailure = data => axios.post('/api/shipping/fail', data);
export const retryDelivery = data => axios.post('/api/shipping/retry', data);
export const startReturnToWarehouse = data => axios.post('/api/shipping/return', data);
export const receiveUndeliveredReturn = data => axios.post('/api/shipping/return/receive', data);
export const getShippingProviders = () => axios.get('/api/shipping/providers');
export const bookCarrierShipment = data => axios.post('/api/shipping/book', data);
export const syncCarrierShipment = orderId => axios.post('/api/shipping/sync', { orderId });
export const cancelCarrierShipment = orderId => axios.post('/api/shipping/cancel', { orderId });
