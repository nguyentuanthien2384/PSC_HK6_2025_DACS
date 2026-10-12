const service = require('../services/shippingProviderService').createShippingProviderService(require('../models'));
const action = name => async (req, res, next) => {
    try { const result = await service[name](req.body, req.user); res.status(result.errCode === 403 ? 403 : 200).json(result); }
    catch (error) { next(error); }
};
const webhook = provider => async (req, res, next) => {
    try { const result = await service.webhook(provider, req.body, req.get('x-shipping-secret') || req.query.hash); res.status([403, 404, 503].includes(result.errCode) ? result.errCode : result.errCode === 0 ? 200 : 500).json(result); }
    catch (error) { next(error); }
};
module.exports = { providers: async (req, res, next) => { try { res.json(await service.providers()); } catch (error) { next(error); } }, book: action('book'), sync: action('sync'), cancel: action('cancel'), ghnWebhook: webhook('ghn'), ghtkWebhook: webhook('ghtk') };
