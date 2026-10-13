import axios from '../axios';
export const getAdminCatalog = (params, signal) => axios.get('/api/admin/catalog', { params, signal });
export const updateAdminCatalogStatus = data => axios.post('/api/admin/catalog/status', data);
