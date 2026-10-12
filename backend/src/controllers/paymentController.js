const { gateway } = require('../services/paymentGatewayService');
const { CommerceError } = require('../utils/commerce');
const authenticated = work => async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ errCode: 401, errMessage: 'Vui lòng đăng nhập.' });
        const result = await work(req);
        return res.status(result.errCode === 403 ? 403 : 200).json(result);
    } catch (error) { next(error); }
};
module.exports = {
    vnpayIpn: async (req, res) => res.status(200).json(await gateway().vnpayIpn(req.query)),
    paypalWebhook: async (req, res, next) => {
        try {
            const result = await gateway().paypalWebhook(req.headers, req.body);
            // Review-required captures are safely persisted, so PayPal may stop retrying.
            res.status(200).json({ received: true, status: result.status });
        } catch (error) {
            if (error instanceof CommerceError) return res.status(error.errCode === 403 ? 403 : 503).json({ received: false, errMessage: error.message });
            next(error);
        }
    },
    getReconciliation: authenticated(req => gateway().getReconciliation(req.query, req.user)),
    reconcileSession: authenticated(req => gateway().reconcileSession(req.body.sessionId, req.user)),
    getRefunds: authenticated(req => gateway().getRefunds(req.query, req.user)),
    refundSession: authenticated(req => gateway().refundSession(req.body, req.user)),
    retryRefund: authenticated(req => gateway().retryRefund(req.params.id, req.user))
};
