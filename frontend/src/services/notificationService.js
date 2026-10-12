import axios from '../axios';

export const getNotifications = ({ limit = 20, offset = 0 } = {}) => axios.get('/api/notifications', { params: { limit, offset } });
export const readNotification = id => axios.post('/api/notifications/read', { id });
export const readAllNotifications = () => axios.post('/api/notifications/read-all', {});
export const notifyNotificationsChanged = () => window.dispatchEvent(new Event('notifications-changed'));
