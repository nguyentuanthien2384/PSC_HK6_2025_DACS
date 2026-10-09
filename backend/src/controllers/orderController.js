import orderService from '../services/orderService';

const handle = work => async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ errCode: 401, errMessage: 'Vui lòng đăng nhập.' });
        const data = await work(req);
        return res.status(data.errCode === 403 ? 403 : 200).json(data);
    } catch (error) { return next(error); }
};
const checkout = req => ({ ...req.body, userId: req.user.id });

module.exports = {
    createNewOrder: handle(req => orderService.createNewOrder(checkout(req))),
    getAllOrders: handle(req => orderService.getAllOrders(req.query, req.user)),
    getDetailOrderById: handle(req => orderService.getDetailOrderById(req.query.id, req.user)),
    updateStatusOrder: handle(req => orderService.updateStatusOrder(req.body, req.user)),
    getAllOrdersByUser: handle(req => orderService.getAllOrdersByUser(req.user.id)),
    getAllOrdersByShipper: handle(req => orderService.getAllOrdersByShipper(req.query, req.user)),
    confirmOrder: handle(req => orderService.confirmOrder(req.body, req.user)),
    updateImageOrder: handle(req => orderService.updateImageOrder(req.body, req.user)),
    paymentOrder: handle(req => orderService.paymentOrder(checkout(req))),
    paymentOrderSuccess: handle(req => orderService.paymentOrderSuccess(checkout(req))),
    paymentOrderVnpay: handle(req => orderService.paymentOrderVnpay({ body: checkout(req), ip: req.ip, socket: req.socket })),
    paymentOrderVnpaySuccess: handle(req => orderService.paymentOrderVnpaySuccess(checkout(req))),
    confirmOrderVnpay: handle(req => orderService.confirmOrderVnpay(req.body))
};
