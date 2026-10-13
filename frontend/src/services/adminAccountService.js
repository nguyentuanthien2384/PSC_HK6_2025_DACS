import axios from '../axios';

export const getAdminAccounts = (params, signal) => axios.get('/api/admin/accounts', { params, signal });
export const changeAdminAccount = data => axios.post('/api/admin/accounts/change', data);
export const getAdminAudit = (params, signal) => axios.get('/api/admin/audit', { params, signal });
