const db = require('../models');
const service = require('../services/afterSalesService').createAfterSalesService(db);
const action = method => async (req, res, next) => {
    try {
        let data = req.body || {};
        if (method === 'refundOnlineReturn' && req.params.id) {
            if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id)) || Number(req.params.id) < 1) return res.status(400).json({ errCode: 1, errMessage: 'Mã yêu cầu trả hàng không hợp lệ.' });
            const request = await db.ReturnRequest.findOne({ where: { id: Number(req.params.id) }, attributes: ['id', 'orderId'], raw: true });
            if (!request) return res.status(404).json({ errCode: 2, errMessage: 'Không tìm thấy yêu cầu trả hàng.' });
            data = { ...data, orderId: request.orderId, returnRequestId: request.id };
        }
        const result = await service[method](data, req.user);
        res.status(result.errCode === 403 ? 403 : 200).json(result);
    } catch (error) { next(error); }
};
module.exports = { request: action('createReturnRequest'), review: action('reviewReturnRequest'), ship: action('markReturnShipped'),
    receive: action('receiveReturn'), manualRefund: action('confirmManualRefund'), onlineRefund: action('refundOnlineReturn') };
