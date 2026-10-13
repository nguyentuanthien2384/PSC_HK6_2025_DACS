const db = require('../models');
const service = require('../services/adminCatalogService').createAdminCatalogService(db);
const action = name => async (req, res, next) => {
    try { const result = await service[name](name === 'list' ? req.query : req.body, req.user); res.status(result.errCode === 403 ? 403 : 200).json(result); }
    catch (error) { next(error); }
};
module.exports = { list: action('list'), updateStatus: action('updateStatus') };
