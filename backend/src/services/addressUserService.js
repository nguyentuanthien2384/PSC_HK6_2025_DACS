import db from '../models/index';
const { Op } = require('sequelize');

const fail = (errCode, errMessage) => ({ errCode, errMessage });
const ok = (extra = {}) => ({ errCode: 0, errMessage: 'OK', ...extra });
const validId = id => /^\d+$/.test(String(id)) && Number.isSafeInteger(+id) && +id > 0;
const text = value => typeof value === 'string' ? value.trim() : '';
const wantsDefault = value => value === true || value === 1 || value === 'true' || value === '1';
const addressValues = data => ({
    shipName: text(data.shipName), shipAdress: text(data.shipAdress || data.shipAddress),
    shipEmail: text(data.shipEmail).toLowerCase(), shipPhonenumber: text(data.shipPhonenumber),
});
const validate = values => {
    if (Object.values(values).some(value => !value || value.length > 255)) return 'Vui lòng nhập đầy đủ thông tin giao hàng (tối đa 255 ký tự mỗi trường)';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.shipEmail)) return 'Email giao hàng không hợp lệ';
    if (!/^\+?[\d\s().-]{8,20}$/.test(values.shipPhonenumber)) return 'Số điện thoại giao hàng không hợp lệ';
    return null;
};
// Lock the owner even when their address list is empty. All default changes share this lock.
const withOwner = (userId, work) => db.sequelize.transaction(async transaction => {
    const user = await db.User.findByPk(userId, { attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE, raw: true });
    if (!user) return fail(2, 'Tài khoản không tồn tại');
    return work(transaction);
});
const addressesFor = (userId, transaction) => db.AddressUser.findAll({ where: { userId }, order: [['id', 'DESC']], raw: true, transaction });
const chosenDefault = rows => rows.find(row => wantsDefault(row.isDefault)) || rows[0];
const saveDefault = async (userId, id, transaction) => {
    await db.AddressUser.update({ isDefault: false }, { where: { userId }, transaction });
    if (id) await db.AddressUser.update({ isDefault: true }, { where: { id, userId }, transaction });
};

const createNewAddressUser = async (data = {}) => {
    if (!validId(data.userId)) return fail(1, 'Thiếu mã người dùng');
    const values = addressValues(data);
    const error = validate(values);
    if (error) return fail(1, error);
    return withOwner(data.userId, async transaction => {
        const previous = await addressesFor(data.userId, transaction);
        const isDefault = !previous.length || wantsDefault(data.isDefault);
        const address = await db.AddressUser.create({ ...values, userId: data.userId, isDefault }, { transaction });
        await saveDefault(data.userId, isDefault ? address.id : chosenDefault(previous).id, transaction);
        return ok({ data: address });
    });
};

const getAllAddressUserByUserId = async userId => {
    if (!validId(userId)) return fail(1, 'Thiếu mã người dùng');
    const rows = await addressesFor(userId);
    const selected = chosenDefault(rows);
    // Legacy address lists without a stored default still get a deterministic checkout choice.
    const addresses = rows.map(row => ({ ...row, isDefault: Number(row.id) === Number(selected?.id) }))
        .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || Number(right.id) - Number(left.id));
    return ok({ data: addresses });
};

const usedInOrder = async (id, userId, transaction) => {
    if (await db.OrderProduct.findOne({ where: { addressUserId: id }, attributes: ['id'], raw: true, transaction })) return true;
    const pending = await db.PaymentSession.findAll({
        where: { userId, status: 'PENDING', expiresAt: { [Op.gt]: new Date() } },
        attributes: ['checkoutData', 'expiresAt'], raw: true, transaction,
    });
    return pending.some(session => Number(JSON.parse(session.checkoutData).addressUserId) === Number(id));
};

const deleteAddressUser = async (data = {}) => {
    if (!validId(data.id) || !validId(data.userId)) return fail(1, 'Thiếu mã địa chỉ hoặc người dùng');
    return withOwner(data.userId, async transaction => {
        // Acquire this row before any snapshot reads, so a completed checkout is visible.
        const address = await db.AddressUser.findOne({ where: { id: data.id, userId: data.userId }, raw: true, transaction, lock: transaction.LOCK.UPDATE });
        if (!address) return fail(2, 'Địa chỉ không tồn tại hoặc không thuộc tài khoản của bạn');
        if (await usedInOrder(data.id, data.userId, transaction)) return fail(2, 'Địa chỉ đã dùng trong đơn hàng hoặc đang thanh toán. Vui lòng thêm địa chỉ mới.');
        const rows = await addressesFor(data.userId, transaction);
        await db.AddressUser.destroy({ where: { id: data.id, userId: data.userId }, transaction });
        const remaining = rows.filter(row => Number(row.id) !== Number(data.id));
        const next = chosenDefault(remaining);
        await saveDefault(data.userId, next?.id, transaction);
        return ok({ defaultAddressId: next?.id || null });
    });
};

const editAddressUser = async (data = {}) => {
    if (!validId(data.id) || !validId(data.userId)) return fail(1, 'Thiếu mã địa chỉ hoặc người dùng');
    const values = addressValues(data);
    const error = validate(values);
    if (error) return fail(1, error);
    return withOwner(data.userId, async transaction => {
        const address = await db.AddressUser.findOne({ where: { id: data.id, userId: data.userId }, raw: false, transaction, lock: transaction.LOCK.UPDATE });
        if (!address) return fail(2, 'Địa chỉ không tồn tại hoặc không thuộc tài khoản của bạn');
        if (await usedInOrder(data.id, data.userId, transaction)) return fail(2, 'Địa chỉ đã dùng trong đơn hàng hoặc đang thanh toán. Vui lòng thêm địa chỉ mới.');
        Object.assign(address, values);
        await address.save({ transaction });
        return ok({ data: address });
    });
};

const setDefaultAddressUser = async (data = {}) => {
    if (!validId(data.id) || !validId(data.userId)) return fail(1, 'Thiếu mã địa chỉ hoặc người dùng');
    return withOwner(data.userId, async transaction => {
        const address = await db.AddressUser.findOne({ where: { id: data.id, userId: data.userId }, raw: true, transaction });
        if (!address) return fail(2, 'Địa chỉ không tồn tại hoặc không thuộc tài khoản của bạn');
        // Preference changes are safe for addresses used by past orders: contents stay intact.
        await saveDefault(data.userId, address.id, transaction);
        return ok({ data: { ...address, isDefault: true } });
    });
};

const getDetailAddressUserById = async (id, userId) => {
    if (!validId(id) || !validId(userId)) return fail(1, 'Thiếu mã địa chỉ hoặc người dùng');
    const address = await db.AddressUser.findOne({ where: { id, userId } });
    return address ? ok({ data: address }) : fail(2, 'Địa chỉ không tồn tại hoặc không thuộc tài khoản của bạn');
};

module.exports = { createNewAddressUser, getAllAddressUserByUserId, deleteAddressUser, editAddressUser, getDetailAddressUserById, setDefaultAddressUser };
