import jwt from 'jsonwebtoken';
import db from '../models/index';
import CommonUtils from '../utils/CommonUtils';
require('dotenv').config();

const rejectAuthentication = (res, message = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn') =>
    res.status(401).json({ errCode: 401, status: false, errMessage: message, refresh: true });

const authenticate = async (req, res, next, optional = false) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        if (optional) return next();
        return rejectAuthentication(res, 'Vui lòng đăng nhập để tiếp tục');
    }
    const match = typeof authorization === 'string' && authorization.match(/^Bearer\s+(\S+)$/i);
    if (!match) return rejectAuthentication(res);
    if (!process.env.JWT_SECRET) {
        return res.status(503).json({ errCode: -1, errMessage: 'Dịch vụ đăng nhập chưa được cấu hình' });
    }

    let payload;
    try {
        payload = jwt.verify(match[1], process.env.JWT_SECRET, {
            algorithms: ['HS256'], issuer: CommonUtils.TOKEN_ISSUER,
        });
        if (!/^\d+$/.test(String(payload.sub)) || !payload.ver) return rejectAuthentication(res);
    } catch (error) {
        return rejectAuthentication(res);
    }

    try {
        const user = await db.User.findOne({
            where: { id: payload.sub, statusId: 'S1' },
            attributes: { exclude: ['image', 'usertoken'] },
            raw: true,
        });
        if (!user || payload.ver !== CommonUtils.passwordVersion(user.password)) {
            return rejectAuthentication(res);
        }
        const { password, usertoken, ...safeUser } = user;
        req.user = safeUser;
        req.auth = payload;
        return next();
    } catch (error) {
        return next(error);
    }
};

const verifyTokenUser = (req, res, next) => authenticate(req, res, next);
const optionalTokenUser = (req, res, next) => authenticate(req, res, next, true);
const verifyTokenAdmin = (req, res, next) => authenticate(req, res, () => {
    if (!['R1', 'R4'].includes(req.user.roleId)) {
        return res.status(403).json({ errCode: 403, status: false, errMessage: 'Bạn không có đủ quyền' });
    }
    return next();
});

module.exports = { verifyTokenUser, verifyTokenAdmin, optionalTokenUser };
