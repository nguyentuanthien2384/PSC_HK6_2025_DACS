const service = require('../services/adminInventoryService').createAdminInventoryService(require('../models'));
const action = (name, input) => async (req, res, next) => {
    try {
        const result = await service[name](input(req), req.user);
        res.status(result.errCode === 403 ? 403 : 200).json(result);
    } catch (error) { next(error); }
};
module.exports = {
    list: action('list', req => req.query),
    history: action('history', req => ({ ...req.query, variantId: req.params.variantId })),
    countStock: action('countStock', req => req.body)
};
