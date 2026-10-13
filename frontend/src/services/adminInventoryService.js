import axios from '../axios';
export const getAdminInventory = params => axios.get('/api/admin/inventory', { params });
export const getInventoryHistory = (variantId, params) => axios.get(`/api/admin/inventory/${variantId}/history`, { params });
export const countInventory = data => axios.post('/api/admin/inventory/count', data);
