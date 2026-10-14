import axios from '../axios';

export const getNotifications = ({ limit = 20, offset = 0, signal } = {}) => axios.get('/api/notifications', { params: { limit, offset }, signal });
export const readNotification = id => axios.post('/api/notifications/read', { id });
export const readAllNotifications = () => axios.post('/api/notifications/read-all', {});
export const notifyNotificationsChanged = () => window.dispatchEvent(new Event('notifications-changed'));
