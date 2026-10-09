import db from '../models/index';
const { createCommerceService } = require('./commerceService');
const { positiveInteger, fail, resultOf } = require('../utils/commerce');
const commerce = createCommerceService(db);
const decodeImage = image => image == null ? '' : Buffer.from(image, 'base64').toString('binary');

const addShopCart = data => resultOf(async () => {
    if (!positiveInteger(data.userId) || !positiveInteger(data.productdetailsizeId) || !positiveInteger(data.quantity)) fail('Sản phẩm và số lượng phải là số nguyên dương.');
    return commerce.transaction(async tx => {
        const productId = Number(data.productdetailsizeId);
        await commerce.lockVariants([{ productId }], tx);
        const variant = await db.ProductDetailSize.findOne({ where: { id: productId }, transaction: tx, raw: true });
        const detail = await db.ProductDetail.findOne({ where: { id: variant.productdetailId }, transaction: tx, raw: true });
        const product = detail && await db.Product.findOne({ where: { id: detail.productId, statusId: 'S1' }, transaction: tx, raw: true });
        if (!product) fail('Sản phẩm đã ngừng kinh doanh.', 2);
        const rows = await db.ShopCart.findAll({ where: { userId: data.userId, productdetailsizeId: productId, statusId: 0 }, ...commerce.lockOptions(tx), raw: false, order: [['id', 'ASC']] });
        const currentQuantity = rows.reduce((sum, row) => sum + Number(row.quantity), 0);
        const quantity = data.type === 'UPDATE_QUANTITY' ? Number(data.quantity) : currentQuantity + Number(data.quantity);
        if (!positiveInteger(quantity) || quantity > 10000) fail('Số lượng không hợp lệ.');
        const stock = await commerce.availableStock(productId, tx);
        if (quantity > stock) fail(`Chỉ còn ${stock} sản phẩm`, 2, { quantity: stock });
        if (rows.length) {
            rows[0].quantity = quantity;
            await rows[0].save({ transaction: tx });
            for (const duplicate of rows.slice(1)) await duplicate.destroy({ transaction: tx });
        } else await db.ShopCart.create({ userId: data.userId, productdetailsizeId: productId, quantity, statusId: 0 }, { transaction: tx });
        return { errCode: 0, errMessage: 'ok', quantity };
    });
});

const getAllShopCartByUserId = userId => resultOf(async () => {
    if (!positiveInteger(userId)) fail('Tài khoản không hợp lệ.');
    const rows = await db.ShopCart.findAll({ where: { userId, statusId: 0 }, raw: true, order: [['id', 'ASC']] });
    const result = [];
    for (const cart of rows) {
        const variant = await db.ProductDetailSize.findOne({ where: { id: cart.productdetailsizeId }, include: [{ model: db.Allcode, as: 'sizeData', attributes: ['value', 'code'] }], raw: true, nest: true });
        const detail = variant && await db.ProductDetail.findOne({ where: { id: variant.productdetailId }, raw: true });
        const product = detail && await db.Product.findOne({ where: { id: detail.productId }, raw: true });
        if (!variant || !detail || !product) continue;
        variant.stock = await commerce.availableStock(variant.id);
        const images = await db.ProductImage.findAll({ where: { productdetailId: detail.id }, raw: true });
        images.forEach(item => { item.image = decodeImage(item.image); });
        result.push({ ...cart, productdetailsizeData: variant, productDetail: detail, productData: product, productDetailImage: images, available: product.statusId === 'S1' && variant.stock > 0 });
    }
    return { errCode: 0, data: result };
});

const deleteItemShopCart = data => resultOf(async () => {
    if (!positiveInteger(data.id) || !positiveInteger(data.userId)) fail('Giỏ hàng không hợp lệ.');
    const deleted = await db.ShopCart.destroy({ where: { id: data.id, userId: data.userId, statusId: 0 } });
    if (!deleted) fail('Không tìm thấy sản phẩm trong giỏ hàng.', 2);
    return { errCode: 0, errMessage: 'ok' };
});

module.exports = { addShopCart, getAllShopCartByUserId, deleteItemShopCart };
