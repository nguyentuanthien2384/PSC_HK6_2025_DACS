import axios from '../axios';
export const getAdminInventory = (params, signal) => axios.get('/api/admin/inventory', { params, signal });
export const getInventoryHistory = (variantId, params, signal) => axios.get(`/api/admin/inventory/${variantId}/history`, { params, signal });
export const countInventory = data => axios.post('/api/admin/inventory/count', data);
