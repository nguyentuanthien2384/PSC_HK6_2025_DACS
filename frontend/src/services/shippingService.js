import axios from '../axios';

export const getAvailableShippingOrders = () => axios.get('/api/get-available-order-for-shipper');
export const getShipperOrders = (status) => axios.get('/api/get-all-order-by-shipper', { params: { status } });
export const getActiveShippers = () => axios.get('/api/get-active-shipper');
export const assignShippingOrder = (orderId, shipperId) => axios.put('/api/confirm-order', {
    orderId, statusId: 'S5', ...(shipperId ? { shipperId } : {}),
});
export const completeShippingOrder = (id, image) => axios.put('/api/update-status-order', {
    id, statusId: 'S6', ...(image ? { image } : {}),
});
export const rateShipper = (data) => axios.post('/api/rate-shipper', data);
