import db from '../models/index';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import emailService from './emailService';
import CommonUtils from '../utils/CommonUtils';
const { Op } = require('sequelize');
require('dotenv').config();

const fail = (errCode, errMessage) => ({ errCode, errMessage });
const ok = (extra = {}) => ({ errCode: 0, errMessage: 'OK', ...extra });
const clean = (value) => typeof value === 'string' ? value.trim() : '';
const normalizeEmail = (value) => clean(value).toLowerCase();
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const validId = (value) => /^\d+$/.test(String(value)) && Number.isSafeInteger(+value) && +value > 0;
const validPassword = (value) => typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
const passwordError = () => fail(1, 'Mật khẩu cần ít nhất 8 ký tự và tối đa 72 byte');
const isManager = (actor) => actor && ['R1', 'R4'].includes(actor.roleId);
const canRead = (id, actor) => actor && (String(actor.id) === String(id) || isManager(actor));
const canManage = (target, actor) => actor && (String(actor.id) === String(target.id) || actor.roleId === 'R1' || (actor.roleId === 'R4' && target.roleId === 'R2'));
const safeUser = (row) => {
    if (!row) return null;
    const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
    const { password, usertoken, ...user } = plain;
    if (Buffer.isBuffer(user.image)) user.image = user.image.toString('utf8');
    return user;
};
const userIncludes = () => [
    { model: db.Allcode, as: 'roleData', attributes: ['value', 'code'] },
    { model: db.Allcode, as: 'genderData', attributes: ['value', 'code'] },
];

const handleCreateNewUser = async (data = {}, actor) => {
    const email = normalizeEmail(data.email);
    if (!validEmail(email) || !clean(data.lastName)) return fail(2, 'Vui lòng nhập email hợp lệ và họ tên');
    if (!validPassword(data.password)) return passwordError();
    const roleId = actor && actor.roleId === 'R1' && data.roleId ? data.roleId : 'R2';
    if (!['R1', 'R2', 'R3', 'R4'].includes(roleId)) return fail(2, 'Vai trò không hợp lệ');
    if (await db.User.findOne({ where: { email } })) return fail(1, 'Email đã được sử dụng');
    const phonenumber = clean(data.phonenumber);
    if (phonenumber && await db.User.findOne({ where: { phonenumber } })) return fail(1, 'Số điện thoại đã được sử dụng');
    try {
        await db.User.create({
            email, password: await bcrypt.hash(data.password, 10),
            firstName: clean(data.firstName), lastName: clean(data.lastName),
            address: clean(data.address), genderId: data.genderId || null,
            phonenumber, image: data.avatar || data.image || null, dob: data.dob || null,
            roleId, isActiveEmail: false, statusId: 'S1', usertoken: '',
        });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') return fail(1, 'Email hoặc số điện thoại đã được sử dụng');
        throw error;
    }
    return ok({ message: 'Tạo tài khoản thành công' });
};

const handleLogin = async (data = {}) => {
    const email = normalizeEmail(data.email);
    if (!validEmail(email) || typeof data.password !== 'string' || !data.password) return fail(4, 'Vui lòng nhập email và mật khẩu');
    const user = await db.User.findOne({ where: { email, statusId: 'S1' }, raw: true });
    if (!user || !user.password || !await bcrypt.compare(data.password, user.password)) return fail(3, 'Email hoặc mật khẩu không chính xác');
    return ok({ user: safeUser(user), accessToken: CommonUtils.encodeToken(user.id, user.password) });
};

const updateUserData = async (data = {}, actor) => {
    const id = data.id || (actor && actor.id);
    if (!validId(id)) return fail(2, 'Thiếu mã người dùng');
    const user = await db.User.findOne({ where: { id, statusId: 'S1' }, raw: false });
    if (!user) return fail(1, 'Người dùng không tồn tại');
    if (!canManage(user, actor)) return fail(403, 'Bạn không có quyền cập nhật người dùng này');
    if (data.roleId && data.roleId !== user.roleId) {
        if (actor.roleId !== 'R1') return fail(403, 'Bạn không có quyền thay đổi vai trò');
        if (!['R1', 'R2', 'R3', 'R4'].includes(data.roleId)) return fail(2, 'Vai trò không hợp lệ');
        user.roleId = data.roleId;
    }
    if (data.lastName !== undefined && !clean(data.lastName)) return fail(2, 'Họ tên không được để trống');
    if (data.phonenumber !== undefined && clean(data.phonenumber)) {
        const duplicate = await db.User.findOne({ where: { phonenumber: clean(data.phonenumber), id: { [Op.ne]: id } } });
        if (duplicate) return fail(1, 'Số điện thoại đã được sử dụng');
    }
    for (const field of ['firstName', 'lastName', 'address', 'phonenumber']) {
        if (data[field] !== undefined) user[field] = clean(data[field]);
    }
    for (const field of ['genderId', 'dob', 'image']) {
        if (data[field] !== undefined) user[field] = data[field];
    }
    await user.save();
    return ok({ data: safeUser(user) });
};

const deleteUser = async (id, actor) => {
    if (!validId(id)) return fail(1, 'Thiếu mã người dùng');
    if (!isManager(actor)) return fail(403, 'Bạn không có đủ quyền');
    const user = await db.User.findOne({ where: { id }, raw: false });
    if (!user) return fail(2, 'Người dùng không tồn tại');
    if (String(actor.id) === String(id)) return fail(2, 'Không thể xóa tài khoản đang đăng nhập');
    if (!canManage(user, actor)) return fail(403, 'Bạn không có quyền xóa người dùng này');
    // Keep historical orders and addresses intact while immediately revoking access.
    user.statusId = 'S2';
    user.usertoken = '';
    await user.save();
    return ok({ message: 'Đã vô hiệu hóa tài khoản' });
};

const handleChangePassword = async (data = {}, actor) => {
    if (!actor) return fail(401, 'Vui lòng đăng nhập');
    if (!validPassword(data.password)) return passwordError();
    if (typeof data.oldpassword !== 'string' || !data.oldpassword) return fail(1, 'Vui lòng nhập mật khẩu hiện tại');
    const user = await db.User.findOne({ where: { id: actor.id, statusId: 'S1' }, raw: false });
    if (!user || !await bcrypt.compare(data.oldpassword, user.password)) return fail(2, 'Mật khẩu cũ không chính xác');
    user.password = await bcrypt.hash(data.password, 10);
    user.usertoken = '';
    await user.save();
    return ok({ accessToken: CommonUtils.encodeToken(user.id, user.password) });
};

const getAllUser = async (data = {}, actor) => {
    if (!isManager(actor)) return fail(403, 'Bạn không có đủ quyền');
    const filter = {
        where: { statusId: 'S1' }, attributes: { exclude: ['password', 'usertoken', 'image'] },
        include: userIncludes(), raw: true, nest: true,
        limit: Math.min(100, Math.max(1, parseInt(data.limit, 10) || 20)),
        offset: Math.max(0, parseInt(data.offset, 10) || 0),
    };
    if (clean(data.keyword)) filter.where[Op.or] = ['phonenumber', 'email', 'firstName', 'lastName'].map((key) => ({ [key]: { [Op.substring]: clean(data.keyword) } }));
    const result = await db.User.findAndCountAll(filter);
    return ok({ data: result.rows.map(safeUser), count: result.count });
};

const getDetailUserById = async (id, actor) => {
    if (!validId(id)) return fail(1, 'Thiếu mã người dùng');
    if (!canRead(id, actor)) return fail(403, 'Bạn không có quyền xem thông tin người dùng này');
    const user = await db.User.findOne({
        where: { id, statusId: 'S1' }, attributes: { exclude: ['password', 'usertoken'] },
        include: userIncludes(), raw: true, nest: true,
    });
    return user ? ok({ data: safeUser(user) }) : fail(2, 'Người dùng không tồn tại');
};

const getDetailUserByEmail = async (value, actor) => {
    const email = normalizeEmail(value);
    if (!validEmail(email)) return fail(1, 'Email không hợp lệ');
    if (!actor || (!isManager(actor) && normalizeEmail(actor.email) !== email)) return fail(403, 'Bạn không có đủ quyền');
    const user = await db.User.findOne({
        where: { email, statusId: 'S1' }, attributes: { exclude: ['password', 'usertoken'] },
        include: userIncludes(), raw: true, nest: true,
    });
    return user ? ok({ data: safeUser(user) }) : fail(2, 'Người dùng không tồn tại');
};

const tokenDigest = (token) => createHash('sha256').update(token).digest('hex');
const createActionToken = (purpose, ttl) => `${purpose}.${Math.floor(Date.now() / 1000) + ttl}.${randomBytes(32).toString('hex')}`;
const validActionToken = (token, purpose) => {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    return parts.length === 3 && parts[0] === purpose && /^\d+$/.test(parts[1]) && +parts[1] > Math.floor(Date.now() / 1000) && /^[a-f0-9]{64}$/.test(parts[2]);
};

const issueEmailToken = async (user, purpose) => {
    const token = createActionToken(purpose, purpose === 'reset' ? 3600 : 86400);
    const digest = tokenDigest(token);
    const baseUrl = (process.env.URL_REACT || 'http://localhost:3000').replace(/\/$/, '');
    const path = purpose === 'reset' ? '/verify-forgotpassword' : '/verify-email';
    const previousToken = user.usertoken || '';
    user.usertoken = digest;
    await user.save();
    try {
        await emailService.sendSimpleEmail({
            firstName: user.firstName, lastName: user.lastName, email: user.email,
            redirectLink: `${baseUrl}${path}?token=${encodeURIComponent(token)}&userId=${user.id}`,
            type: purpose === 'reset' ? 'forgotpassword' : 'verifyEmail',
        });
    } catch (error) {
        // Restore only this failed send; do not overwrite a newer token request.
        await db.User.update({ usertoken: previousToken }, { where: { id: user.id, usertoken: digest } });
        throw error;
    }
};

const handleSendVerifyEmailUser = async (data = {}, actor) => {
    if (!actor) return fail(401, 'Vui lòng đăng nhập');
    const user = await db.User.findOne({ where: { id: actor.id, statusId: 'S1' }, raw: false });
    if (!user) return fail(2, 'Người dùng không tồn tại');
    if (user.isActiveEmail) return ok({ message: 'Email đã được xác thực' });
    await issueEmailToken(user, 'verify');
    return ok({ message: 'Vui lòng kiểm tra email' });
};

const handleVerifyEmailUser = async (data = {}) => {
    if (!validId(data.id) || !validActionToken(data.token, 'verify')) return fail(2, 'Liên kết xác thực không hợp lệ hoặc đã hết hạn');
    const [updated] = await db.User.update({ isActiveEmail: true, usertoken: '' }, {
        where: { id: data.id, statusId: 'S1', usertoken: tokenDigest(data.token) },
    });
    return updated ? ok() : fail(2, 'Liên kết xác thực không hợp lệ hoặc đã được sử dụng');
};

const handleSendEmailForgotPassword = async (value) => {
    const email = normalizeEmail(value);
    if (!validEmail(email)) return fail(1, 'Email không hợp lệ');
    // Report missing SMTP consistently, including addresses without an account.
    emailService.ensureConfigured();
    const user = await db.User.findOne({ where: { email, statusId: 'S1' }, raw: false });
    if (user) await issueEmailToken(user, 'reset');
    return ok({ message: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi đến bạn' });
};

const handleForgotPassword = async (data = {}) => {
    if (!validPassword(data.password)) return passwordError();
    if (!validId(data.id) || !validActionToken(data.token, 'reset')) return fail(2, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    const [updated] = await db.User.update({ password: await bcrypt.hash(data.password, 10), usertoken: '' }, {
        where: { id: data.id, statusId: 'S1', usertoken: tokenDigest(data.token) },
    });
    return updated ? ok() : fail(2, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng');
};

const checkPhonenumberEmail = async (data = {}) => {
    const email = normalizeEmail(data.email);
    const phone = clean(data.phonenumber);
    if (phone && await db.User.findOne({ where: { phonenumber: phone }, attributes: ['id'] })) return { isCheck: true, errMessage: 'Số điện thoại đã tồn tại' };
    if (email && await db.User.findOne({ where: { email }, attributes: ['id'] })) return { isCheck: true, errMessage: 'Email đã tồn tại' };
    return { isCheck: false, errMessage: 'Hợp lệ' };
};

module.exports = {
    handleCreateNewUser, deleteUser, updateUserData, handleLogin, handleChangePassword,
    getAllUser, getDetailUserById, getDetailUserByEmail, handleSendVerifyEmailUser,
    handleVerifyEmailUser, handleSendEmailForgotPassword, handleForgotPassword, checkPhonenumberEmail,
};
