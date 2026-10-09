import shopCartService from '../services/shopCartService';

const handle = work => async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ errCode: 401, errMessage: 'Vui lòng đăng nhập.' });
        const data = await work(req);
        return res.status(200).json(data);
    } catch (error) { return next(error); }
};

module.exports = {
    addShopCart: handle(req => shopCartService.addShopCart({ ...req.body, userId: req.user.id })),
    getAllShopCartByUserId: handle(req => shopCartService.getAllShopCartByUserId(req.user.id)),
    deleteItemShopCart: handle(req => shopCartService.deleteItemShopCart({ ...req.body, userId: req.user.id }))
};
