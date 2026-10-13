const db = require('../models');
const service = require('../services/adminOperationsService').createAdminOperationsService(db);
const action = name => async (req, res, next) => {
    try {
        const result = await service[name](name === 'bulk' ? req.body : req.query, req.user);
        res.status(result.errCode === 403 ? 403 : 200).json(result);
    } catch (error) { next(error); }
};
module.exports = { orders: action('orders'), returns: action('returns'), dashboard: action('dashboard'), bulk: action('bulk') };
