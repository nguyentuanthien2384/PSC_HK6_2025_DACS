import axios from '../axios';
import { readRequest } from './catalogRequest';

export const getAvailableShippingOrders = (options = {}) => readRequest('/api/get-available-order-for-shipper', options);
export const getShipperOrders = (status, options = {}) => readRequest('/api/get-all-order-by-shipper', { ...options, params: { status } });
export const getActiveShippers = (options = {}) => readRequest('/api/get-active-shipper', options);
export const assignShippingOrder = (orderId, shipperId) => axios.put('/api/confirm-order', {
    orderId, statusId: 'S5', ...(shipperId ? { shipperId } : {}),
});
export const completeShippingOrder = (id, image) => axios.put('/api/update-status-order', {
    id, statusId: 'S6', ...(image ? { image } : {}),
});
export const rateShipper = (data) => axios.post('/api/rate-shipper', data);
