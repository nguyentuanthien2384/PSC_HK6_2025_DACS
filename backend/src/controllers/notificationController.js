const db = require('../models');
const service = require('../services/notificationService').createNotificationService(db);
const action = name => async (req, res, next) => {
    try { const result = await service[name](name === 'list' ? req.query : req.body, req.user); res.status(result.errCode === 401 ? 401 : 200).json(result); }
    catch (error) { next(error); }
};
module.exports = { list: action('list'), read: action('read'), readAll: action('readAll') };
