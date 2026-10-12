import axios from '../axios';

export const setDefaultAddressUserService = id => axios.post('/api/set-default-address-user', { id });
