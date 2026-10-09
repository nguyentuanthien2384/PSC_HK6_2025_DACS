const db = require('../models');
const { Op } = require('sequelize');
const { createCommerceService } = require('./commerceService');
const { positiveInteger, money, fail, resultOf, voucherIsActive } = require('../utils/commerce');
const commerce = createCommerceService(db);
const ok = data => ({ errCode: 0, errMessage: 'ok', ...data });
const pagination = (data = {}) => Number(data.limit) > 0 ? { limit: Math.min(100, Number(data.limit)), offset: Math.max(0, Number(data.offset) || 0) } : {};
const typeInclude = () => [{ model: db.Allcode, as: 'typeVoucherData', attributes: ['value', 'code'] }];
const voucherInclude = () => [{ model: db.TypeVoucher, as: 'typeVoucherOfVoucherData', include: typeInclude() }];
const find = async (model, id, options = {}) => {
  if (!positiveInteger(id)) fail('Mã dữ liệu không hợp lệ.');
  const row = await model.findByPk(id, options);
  if (!row) fail('Dữ liệu không tồn tại.', 2);
  return row;
};
const typeValues = data => {
  if (!['percent', 'money'].includes(data.typeVoucher)) fail('Loại giảm giá không hợp lệ.');
  const result = { typeVoucher: data.typeVoucher, value: money(data.value), minValue: money(data.minValue), maxValue: money(data.maxValue) };
  if (result.typeVoucher === 'percent' && (result.value < 1 || result.value > 100)) fail('Phần trăm giảm giá phải từ 1 đến 100.');
  if (result.typeVoucher === 'money' && !(result.maxValue || result.value)) fail('Giá trị giảm giá phải lớn hơn 0.');
  return result;
};
const voucherValues = async (data, tx) => {
  if (typeof data.codeVoucher !== 'string' || !data.codeVoucher.trim() || !positiveInteger(data.amount) || !positiveInteger(data.typeVoucherId)) fail('Thông tin voucher không hợp lệ.');
  const date = value => /^\d+$/.test(String(value)) ? Number(value) : new Date(value).getTime();
  const from = date(data.fromDate), to = date(data.toDate);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) fail('Thời gian sử dụng voucher không hợp lệ.');
  await find(db.TypeVoucher, data.typeVoucherId, { transaction: tx, raw: true });
  const duplicate = await db.Voucher.findOne({ where: { codeVoucher: data.codeVoucher.trim(), ...(data.id ? { id: { [Op.ne]: data.id } } : {}) }, transaction: tx, raw: true });
  if (duplicate) fail('Mã voucher đã tồn tại.', 2);
  return { codeVoucher: data.codeVoucher.trim(), amount: Number(data.amount), typeVoucherId: data.typeVoucherId, fromDate: String(from), toDate: String(to) };
};
const decorate = async voucher => {
  voucher.usedAmount = await db.VoucherUsed.count({ where: { voucherId: voucher.id, status: 1 } });
  return voucher;
};
const createNewTypeVoucher = data => resultOf(async () => ok({ data: await db.TypeVoucher.create(typeValues(data)) }));
const getDetailTypeVoucherById = id => resultOf(async () => ok({ data: await find(db.TypeVoucher, id, { include: typeInclude(), raw: true, nest: true }) }));
const getAllTypeVoucher = data => resultOf(async () => {
  const rows = await db.TypeVoucher.findAndCountAll({ ...pagination(data), include: typeInclude(), raw: true, nest: true });
  return ok({ data: rows.rows, count: rows.count });
});
const getSelectTypeVoucher = () => resultOf(async () => ok({ data: await db.TypeVoucher.findAll({ include: typeInclude(), raw: true, nest: true }) }));
const updateTypeVoucher = data => resultOf(async () => {
  const values = typeValues(data);
  const row = await find(db.TypeVoucher, data.id, { raw: false });
  Object.assign(row, values); await row.save(); return ok();
});
const deleteTypeVoucher = data => resultOf(async () => {
  await find(db.TypeVoucher, data.id);
  if (await db.Voucher.count({ where: { typeVoucherId: data.id } })) fail('Loại giảm giá đang được sử dụng trong voucher.', 2);
  await db.TypeVoucher.destroy({ where: { id: data.id } }); return ok();
});
const createNewVoucher = data => resultOf(async () => commerce.transaction(async tx => ok({ data: await db.Voucher.create(await voucherValues(data, tx), { transaction: tx }) })));
const getDetailVoucherById = id => resultOf(async () => ok({ data: await decorate(await find(db.Voucher, id, { include: voucherInclude(), raw: true, nest: true })) }));
const getAllVoucher = data => resultOf(async () => {
  const rows = await db.Voucher.findAndCountAll({ ...pagination(data), include: voucherInclude(), order: [['createdAt', 'DESC']], raw: true, nest: true });
  for (const row of rows.rows) await decorate(row);
  return ok({ data: rows.rows, count: rows.count });
});
const updateVoucher = data => resultOf(async () => commerce.transaction(async tx => {
  const row = await find(db.Voucher, data.id, { ...commerce.lockOptions(tx), raw: false });
  const values = await voucherValues(data, tx);
  const reserved = (await commerce.activeSessions(tx)).filter(session => Number(session.checkout.voucherId) === Number(data.id)).length;
  const used = await db.VoucherUsed.count({ where: { voucherId: data.id, status: 1 }, transaction: tx });
  if (values.amount < used + reserved) fail('Số lượt voucher không thể thấp hơn số đã dùng và đang thanh toán.', 2);
  Object.assign(row, values); await row.save({ transaction: tx }); return ok();
}));
const deleteVoucher = data => resultOf(async () => commerce.transaction(async tx => {
  const row = await find(db.Voucher, data.id, { ...commerce.lockOptions(tx), raw: false });
  if (await db.OrderProduct.count({ where: { voucherId: data.id }, transaction: tx }) || (await commerce.activeSessions(tx)).some(session => Number(session.checkout.voucherId) === Number(data.id))) fail('Voucher đã dùng trong đơn hàng hoặc đang thanh toán.', 2);
  await db.VoucherUsed.destroy({ where: { voucherId: data.id }, transaction: tx });
  await row.destroy({ transaction: tx }); return ok();
}));
const saveUserVoucher = data => resultOf(async () => {
  if (!positiveInteger(data.userId)) fail('Tài khoản không hợp lệ.');
  return commerce.transaction(async tx => {
    const voucher = await find(db.Voucher, data.voucherId, { ...commerce.lockOptions(tx), raw: false });
    if (!voucherIsActive(voucher)) fail('Voucher chưa có hiệu lực hoặc đã hết hạn.', 2);
    const used = await db.VoucherUsed.count({ where: { voucherId: voucher.id, status: 1 }, transaction: tx });
    if (used >= Number(voucher.amount)) fail('Voucher đã hết lượt sử dụng.', 2);
    if (await db.VoucherUsed.findOne({ where: { userId: data.userId, voucherId: voucher.id }, transaction: tx })) fail('Bạn đã lưu hoặc sử dụng voucher này.', 2);
    await db.VoucherUsed.create({ userId: data.userId, voucherId: voucher.id, status: 0 }, { transaction: tx });
    return ok();
  });
});
const getAllVoucherByUserId = data => resultOf(async () => {
  if (!positiveInteger(data.id)) fail('Tài khoản không hợp lệ.');
  const saved = await db.VoucherUsed.findAll({ where: { userId: data.id, status: 0 }, raw: true, order: [['createdAt', 'DESC']] });
  const rows = [];
  for (const entry of saved) {
    const voucher = await db.Voucher.findByPk(entry.voucherId, { include: voucherInclude(), raw: true, nest: true });
    if (!voucher || !voucherIsActive(voucher)) continue;
    entry.voucherData = await decorate(voucher);
    if (entry.voucherData.usedAmount < Number(voucher.amount)) rows.push(entry);
  }
  const count = rows.length, { limit, offset = 0 } = pagination(data);
  return ok({ data: limit ? rows.slice(offset, offset + limit) : rows, count });
});
module.exports = { createNewTypeVoucher, getDetailTypeVoucherById, getAllTypeVoucher, getSelectTypeVoucher, updateTypeVoucher, deleteTypeVoucher,
  createNewVoucher, getDetailVoucherById, getAllVoucher, updateVoucher, deleteVoucher, saveUserVoucher, getAllVoucherByUserId };