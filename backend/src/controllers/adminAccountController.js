const service = require('../services/adminAccountService').createAdminAccountService(require('../models'));
const audit = require('../services/adminAuditService').createAdminAuditService(require('../models'));
const action = work => async (req, res, next) => {
    try { const result = await work(req); res.status(result.errCode === 403 ? 403 : 200).json(result); } catch (error) { next(error); }
};
module.exports = { list: action(req => service.list(req.query, req.user)), change: action(req => service.change(req.body, req.user)), audit: action(req => audit.list(req.query, req.user)) };
