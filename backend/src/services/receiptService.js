const db = require('../models');
const { Op } = require('sequelize');
const { createCommerceService } = require('./commerceService');
const { positiveInteger, money, fail, resultOf } = require('../utils/commerce');
const commerce = createCommerceService(db);
const safeUser = { exclude: ['password', 'usertoken', 'image'] };

const validateLine = data => {
  if (!positiveInteger(data.productDetailSizeId) || !positiveInteger(data.quantity) || Number(data.quantity) > 1000000) fail('Sản phẩm và số lượng nhập phải là số nguyên dương.');
  return { productDetailSizeId: Number(data.productDetailSizeId), quantity: Number(data.quantity), price: money(data.price) };
};
const supplierExists = async (id, tx) => {
  if (!positiveInteger(id) || !await db.Supplier.findByPk(id, { transaction: tx, raw: true })) fail('Nhà cung cấp không tồn tại.', 2);
};
const createNewReceipt = data => resultOf(async () => {
  const line = validateLine(data);
  if (!positiveInteger(data.userId)) fail('Tài khoản không hợp lệ.');
  return commerce.transaction(async tx => {
    await commerce.lockVariants([{ productId: line.productDetailSizeId }], tx);
    await supplierExists(data.supplierId, tx);
    const receipt = await db.Receipt.create({ userId: data.userId, supplierId: data.supplierId }, { transaction: tx });
    await db.ReceiptDetail.create({ ...line, receiptId: receipt.id }, { transaction: tx });
    return { errCode: 0, errMessage: 'Nhập hàng thành công.', data: receipt };
  });
});
const createNewReceiptDetail = data => resultOf(async () => {
  const line = validateLine(data);
  if (!positiveInteger(data.receiptId)) fail('Phiếu nhập không hợp lệ.');
  return commerce.transaction(async tx => {
    await commerce.lockVariants([{ productId: line.productDetailSizeId }], tx);
    const receipt = await db.Receipt.findByPk(data.receiptId, { ...commerce.lockOptions(tx), raw: true });
    if (!receipt) fail('Không tìm thấy phiếu nhập.', 2);
    await db.ReceiptDetail.create({ ...line, receiptId: receipt.id }, { transaction: tx });
    return { errCode: 0, errMessage: 'Nhập hàng thành công.' };
  });
});
const getDetailReceiptById = id => resultOf(async () => {
  if (!positiveInteger(id)) fail('Phiếu nhập không hợp lệ.');
  const receipt = await db.Receipt.findByPk(id, { raw: true });
  if (!receipt) fail('Không tìm thấy phiếu nhập.', 2);
  receipt.receiptDetail = await db.ReceiptDetail.findAll({ where: { receiptId: id }, raw: true });
  for (const line of receipt.receiptDetail) {
    line.productDetailSizeData = await db.ProductDetailSize.findByPk(line.productDetailSizeId, { include: [{ model: db.Allcode, as: 'sizeData', attributes: ['value', 'code'] }], raw: true, nest: true });
    line.productDetailData = line.productDetailSizeData ? await db.ProductDetail.findByPk(line.productDetailSizeData.productdetailId, { raw: true }) : null;
    line.productData = line.productDetailData ? await db.Product.findByPk(line.productDetailData.productId, { raw: true }) : null;
  }
  return { errCode: 0, data: receipt };
});
const getAllReceipt = (data = {}) => resultOf(async () => {
  const filter = { order: [['createdAt', 'DESC']], raw: true };
  if (data.limit !== undefined) { filter.limit = Math.min(100, Math.max(1, Number(data.limit) || 10)); filter.offset = Math.max(0, Number(data.offset) || 0); }
  const result = await db.Receipt.findAndCountAll(filter);
  for (const receipt of result.rows) {
    receipt.userData = await db.User.findByPk(receipt.userId, { attributes: safeUser, raw: true });
    receipt.supplierData = await db.Supplier.findByPk(receipt.supplierId, { raw: true });
  }
  return { errCode: 0, data: result.rows, count: result.count };
});
const updateReceipt = data => resultOf(async () => {
  if (!positiveInteger(data.id)) fail('Phiếu nhập không hợp lệ.');
  return commerce.transaction(async tx => {
    await supplierExists(data.supplierId, tx);
    const receipt = await db.Receipt.findByPk(data.id, { ...commerce.lockOptions(tx), raw: false });
    if (!receipt) fail('Không tìm thấy phiếu nhập.', 2);
    receipt.supplierId = data.supplierId;
    await receipt.save({ transaction: tx });
    return { errCode: 0, errMessage: 'Cập nhật phiếu nhập thành công.' };
  });
});
const deleteReceipt = data => resultOf(async () => {
  if (!positiveInteger(data.id)) fail('Phiếu nhập không hợp lệ.');
  return commerce.transaction(async tx => {
    const lines = await db.ReceiptDetail.findAll({ where: { receiptId: data.id }, transaction: tx, raw: true });
    const amounts = new Map();
    lines.forEach(line => amounts.set(line.productDetailSizeId, (amounts.get(line.productDetailSizeId) || 0) + Number(line.quantity)));
    await commerce.lockVariants([...amounts.keys()].map(productId => ({ productId })), tx);
    const receipt = await db.Receipt.findByPk(data.id, { ...commerce.lockOptions(tx), raw: false });
    if (!receipt) fail('Không tìm thấy phiếu nhập.', 2);
    for (const [id, amount] of amounts) {
      if (await commerce.availableStock(id, tx) < amount) fail('Không thể xóa phiếu nhập: hàng đã bán hoặc đang được giữ cho thanh toán.', 2);
    }
    await db.ReceiptDetail.destroy({ where: { receiptId: receipt.id }, transaction: tx });
    await receipt.destroy({ transaction: tx });
    return { errCode: 0, errMessage: 'Xóa phiếu nhập thành công.' };
  });
});
module.exports = { createNewReceipt, createNewReceiptDetail, getDetailReceiptById, getAllReceipt, updateReceipt, deleteReceipt };
