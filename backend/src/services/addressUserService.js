import db from '../models/index';

const fail = (errCode, errMessage) => ({ errCode, errMessage });
const ok = (extra = {}) => ({ errCode: 0, errMessage: 'OK', ...extra });
const validId = (id) => /^\d+$/.test(String(id)) && Number.isSafeInteger(+id) && +id > 0;
const text = (value) => typeof value === 'string' ? value.trim() : '';
const addressValues = (data) => ({
    shipName: text(data.shipName), shipAdress: text(data.shipAdress || data.shipAddress),
    shipEmail: text(data.shipEmail).toLowerCase(), shipPhonenumber: text(data.shipPhonenumber),
});
const validate = (values) => {
    if (Object.values(values).some((value) => !value || value.length > 255)) return 'Vui lòng nhập đầy đủ thông tin giao hàng (tối đa 255 ký tự mỗi trường)';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.shipEmail)) return 'Email giao hàng không hợp lệ';
    if (!/^\+?[\d\s().-]{8,20}$/.test(values.shipPhonenumber)) return 'Số điện thoại giao hàng không hợp lệ';
    return null;
};

const createNewAddressUser = async (data = {}) => {
    if (!validId(data.userId)) return fail(1, 'Thiếu mã người dùng');
    const values = addressValues(data);
    const error = validate(values);
    if (error) return fail(1, error);
    const address = await db.AddressUser.create({ ...values, userId: data.userId });
    return ok({ data: address });
};

const getAllAddressUserByUserId = async (userId) => {
    if (!validId(userId)) return fail(1, 'Thiếu mã người dùng');
    const addresses = await db.AddressUser.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
    return ok({ data: addresses });
};

const deleteAddressUser = async (data = {}) => {
    if (!validId(data.id) || !validId(data.userId)) return fail(1, 'Thiếu mã địa chỉ hoặc người dùng');
    const deleted = await db.AddressUser.destroy({ where: { id: data.id, userId: data.userId } });
    return deleted ? ok() : fail(2, 'Địa chỉ không tồn tại hoặc không thuộc tài khoản của bạn');
};

const editAddressUser = async (data = {}) => {
    if (!validId(data.id) || !validId(data.userId)) return fail(1, 'Thiếu mã địa chỉ hoặc người dùng');
    const values = addressValues(data);
    const error = validate(values);
    if (error) return fail(1, error);
    const address = await db.AddressUser.findOne({ where: { id: data.id, userId: data.userId }, raw: false });
    if (!address) return fail(2, 'Địa chỉ không tồn tại hoặc không thuộc tài khoản của bạn');
    Object.assign(address, values);
    await address.save();
    return ok({ data: address });
};

const getDetailAddressUserById = async (id, userId) => {
    if (!validId(id) || !validId(userId)) return fail(1, 'Thiếu mã địa chỉ hoặc người dùng');
    const address = await db.AddressUser.findOne({ where: { id, userId } });
    return address ? ok({ data: address }) : fail(2, 'Địa chỉ không tồn tại hoặc không thuộc tài khoản của bạn');
};

module.exports = { createNewAddressUser, getAllAddressUserByUserId, deleteAddressUser, editAddressUser, getDetailAddressUserById };
