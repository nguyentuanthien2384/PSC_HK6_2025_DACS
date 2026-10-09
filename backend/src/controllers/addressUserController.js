import addressUserService from '../services/addressUserService';

const handle = (operation) => async (req, res) => {
    if (!req.user) return res.status(401).json({ errCode: 401, errMessage: 'Vui lòng đăng nhập' });
    try {
        return res.status(200).json(await operation(req));
    } catch (error) {
        console.error('Address API error:', error.code || error.name || 'Error');
        return res.status(500).json({ errCode: -1, errMessage: 'Không thể xử lý địa chỉ. Vui lòng thử lại sau' });
    }
};

// Identity always comes from the verified JWT, including requests with a forged userId.
module.exports = {
    createNewAddressUser: handle((req) => addressUserService.createNewAddressUser({ ...req.body, userId: req.user.id })),
    getAllAddressUserByUserId: handle((req) => addressUserService.getAllAddressUserByUserId(req.user.id)),
    deleteAddressUser: handle((req) => addressUserService.deleteAddressUser({ ...req.body, userId: req.user.id })),
    editAddressUser: handle((req) => addressUserService.editAddressUser({ ...req.body, userId: req.user.id })),
    getDetailAddressUserById: handle((req) => addressUserService.getDetailAddressUserById(req.query.id, req.user.id)),
};
