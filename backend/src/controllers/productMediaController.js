const { createProductMediaService } = require('../services/productMediaService');
function createMediaHandler(service) { return async (req, res, next) => {
    try {
        const asset = await service.get(req.params.id, req.params.version, req.params.variant, req.params.type);
        if (asset.redirect) return res.set('Cache-Control', 'no-store').redirect(302, asset.redirect);
        res.set({ 'Content-Type': asset.contentType, 'Cache-Control': 'public, max-age=31536000, immutable', ETag: asset.etag, 'X-Content-Type-Options': 'nosniff' });
        if (req.fresh) return res.status(304).end();
        return res.send(asset.body);
    } catch (error) {
        if (error.status) { res.set('Cache-Control', 'no-store'); if (error.status === 503) res.set('Retry-After', '2'); }
        next(error);
    }
}; }
let handler;
module.exports = (req, res, next) => {
    if (!handler) handler = createMediaHandler(createProductMediaService(require('../models')));
    return handler(req, res, next);
};
module.exports.createMediaHandler = createMediaHandler;
