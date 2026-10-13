import axios from '../axios';

export const getOperationsOrders = (params, signal) => axios.get('/api/admin/operations/orders', { params, signal });
export const getOperationsReturns = (params, signal) => axios.get('/api/admin/operations/returns', { params, signal });
export const getOperationsDashboard = (params, signal) => axios.get('/api/admin/operations/dashboard', { params, signal });
export const bulkOperationsOrders = data => axios.post('/api/admin/operations/bulk', data);
