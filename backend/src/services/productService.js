import db from "../models/index";
import jsrecommender from 'js-recommender'
require('dotenv').config();
const { Op } = require("sequelize");
const { createCommerceService } = require('./commerceService');
const { resultOf, fail, positiveInteger, money } = require('../utils/commerce');
const commerce = createCommerceService(db);
const decodeImage = image => image == null ? '' : Buffer.from(image).toString('utf8');
const storefrontLimit = value => {
    const limit = Number(value);
    return Number.isFinite(limit) && limit > 0 ? Math.min(100, Math.max(1, Math.floor(limit))) : 20;
};
function dynamicSort(property) {
    var sortOrder = 1;
    if (property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a, b) {
        /// sap xep tang dan
        var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        return result * sortOrder;
    }
}
function dynamicSortMultiple() {

    var props = arguments;
    return function (obj1, obj2) {
        var i = 0, result = 0, numberOfProperties = props.length;
        /* try getting a different result from 0 (equal)
         * as long as we have extra properties to compare
         */
        while (result === 0 && i < numberOfProperties) {
            result = dynamicSort(props[i])(obj1, obj2);
            i++;
        }
        return result;
    }
}

const createNewProduct = data => resultOf(async () => {
    if (!data.name || !data.categoryId || !data.brandId || !data.image || !data.nameDetail || !data.sizeId) fail('Vui lòng nhập đầy đủ thông tin sản phẩm.');
    const originalPrice = money(data.originalPrice), discountPrice = money(data.discountPrice);
    if (discountPrice > originalPrice) fail('Giá bán không được vượt quá giá gốc.');
    return commerce.transaction(async tx => {
        const product = await db.Product.create({ name: data.name, contentHTML: data.contentHTML, contentMarkdown: data.contentMarkdown, statusId: 'S1', categoryId: data.categoryId, madeby: data.madeby, material: data.material, brandId: data.brandId, view: 0 }, { transaction: tx });
        const detail = await db.ProductDetail.create({ productId: product.id, description: data.description, originalPrice, discountPrice, nameDetail: data.nameDetail }, { transaction: tx });
        await db.ProductImage.create({ productdetailId: detail.id, image: data.image }, { transaction: tx });
        await db.ProductDetailSize.create({ productdetailId: detail.id, width: data.width, height: data.height, sizeId: data.sizeId, weight: data.weight }, { transaction: tx });
        return { errCode: 0, errMessage: 'ok', data: product };
    });
});
let getAllProductAdmin = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            let objectFilter = {

                include: [
                    { model: db.Allcode, as: 'brandData', attributes: ['value', 'code'] },
                    { model: db.Allcode, as: 'categoryData', attributes: ['value', 'code'] },
                    { model: db.Allcode, as: 'statusData', attributes: ['value', 'code'] },
                ],
                raw: true,
                nest: true
            }
            if (Number(data.limit) > 0) {
                objectFilter.limit = Math.min(100, Math.max(1, Number(data.limit) || 20))
                objectFilter.offset = Math.max(0, Number(data.offset) || 0)
            }

            if (data.categoryId && data.categoryId !== 'ALL') objectFilter.where = { ...objectFilter.where, categoryId: data.categoryId }
            if (data.brandId && data.brandId !== 'ALL') objectFilter.where = { ...objectFilter.where, brandId: data.brandId }
            if (data.sortName === "true") objectFilter.order = [['name', 'ASC']]
            if (typeof data.keyword === 'string' && data.keyword.trim()) objectFilter.where = { ...objectFilter.where, name: { [Op.substring]: data.keyword } }

            let res = await db.Product.findAndCountAll(objectFilter)
            for (let i = 0; i < res.rows.length; i++) {
                let objectFilterProductDetail = {
                    where: { productId: res.rows[i].id }, raw: true
                }

                res.rows[i].productDetail = await db.ProductDetail.findAll(objectFilterProductDetail)

                for (let j = 0; j < res.rows[i].productDetail.length; j++) {
                    res.rows[i].productDetail[j].productDetailSize = await db.ProductDetailSize.findAll({ where: { productdetailId: res.rows[i].productDetail[j].id }, raw: true })

                    res.rows[i].price = res.rows[i].productDetail[0].discountPrice
                    res.rows[i].productDetail[j].productImage = await db.ProductImage.findAll({ where: { productdetailId: res.rows[i].productDetail[j].id }, raw: true })
                    for (let k = 0; k < res.rows[i].productDetail[j].productImage.length > 0; k++) {
                        res.rows[i].productDetail[j].productImage[k].image = decodeImage(res.rows[i].productDetail[j].productImage[k].image)
                    }
                }
            }
            if (data.sortPrice && data.sortPrice === "true") {

                res.rows.sort(dynamicSortMultiple("price"))
            }

            resolve({
                errCode: 0,
                data: res.rows,
                count: res.count
            })


        } catch (error) {
            reject(error)
        }
    })
}
let getAllProductUser = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            let objectFilter = {
                where: { statusId: 'S1' },
                include: [
                    { model: db.Allcode, as: 'brandData', attributes: ['value', 'code'] },
                    { model: db.Allcode, as: 'categoryData', attributes: ['value', 'code'] },
                    { model: db.Allcode, as: 'statusData', attributes: ['value', 'code'] },
                ],
                raw: true,
                nest: true
            }
            if (Number(data.limit) > 0) {
                objectFilter.limit = Math.min(100, Math.max(1, Number(data.limit) || 20))
                objectFilter.offset = Math.max(0, Number(data.offset) || 0)
            }

            if (data.categoryId && data.categoryId !== 'ALL') objectFilter.where = { ...objectFilter.where, categoryId: data.categoryId }
            if (data.brandId && data.brandId !== 'ALL') objectFilter.where = { ...objectFilter.where, brandId: data.brandId }
            if (data.sortName === "true") objectFilter.order = [['name', 'ASC']]
            if (typeof data.keyword === 'string' && data.keyword.trim()) objectFilter.where = { ...objectFilter.where, name: { [Op.substring]: data.keyword } }

            let res = await db.Product.findAndCountAll(objectFilter)
            for (let i = 0; i < res.rows.length; i++) {
                let objectFilterProductDetail = {
                    where: { productId: res.rows[i].id }, raw: true
                }

                res.rows[i].productDetail = await db.ProductDetail.findAll(objectFilterProductDetail)

                for (let j = 0; j < res.rows[i].productDetail.length; j++) {
                    res.rows[i].productDetail[j].productDetailSize = await db.ProductDetailSize.findAll({ where: { productdetailId: res.rows[i].productDetail[j].id }, raw: true })

                    res.rows[i].price = res.rows[i].productDetail[0].discountPrice
                    res.rows[i].productDetail[j].productImage = await db.ProductImage.findAll({ where: { productdetailId: res.rows[i].productDetail[j].id }, raw: true })
                    for (let k = 0; k < res.rows[i].productDetail[j].productImage.length > 0; k++) {
                        res.rows[i].productDetail[j].productImage[k].image = decodeImage(res.rows[i].productDetail[j].productImage[k].image)
                    }
                }
            }
            if (data.sortPrice && data.sortPrice === "true") {

                res.rows.sort(dynamicSortMultiple("price"))
            }

            resolve({
                errCode: 0,
                data: res.rows,
                count: res.count
            })


        } catch (error) {
            reject(error)
        }
    })
}
let UnactiveProduct = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let product = await db.Product.findOne({
                    where: { id: data.id },
                    raw: false
                })
                if (!product) {
                    resolve({
                        errCode: 2,
                        errMessage: `The product isn't exist`
                    })
                } else {
                    product.statusId = 'S2';
                    await product.save();
                    resolve({
                        errCode: 0,
                        errMessage: 'ok'
                    })
                }
            }
        } catch (error) {
            reject(error)
        }
    })
}
let ActiveProduct = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let product = await db.Product.findOne({
                    where: { id: data.id },
                    raw: false
                })
                if (!product) {
                    resolve({
                        errCode: 2,
                        errMessage: `The product isn't exist`
                    })
                } else {
                    product.statusId = 'S1';
                    await product.save();
                    resolve({
                        errCode: 0,
                        errMessage: 'ok'
                    })
                }
            }
        } catch (error) {
            reject(error)
        }
    })
}
let getDetailProductById = (id, actor) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let res = await db.Product.findOne({
                    where: { id: id },
                    include: [
                        { model: db.Allcode, as: 'brandData', attributes: ['value', 'code'] },
                        { model: db.Allcode, as: 'categoryData', attributes: ['value', 'code'] },
                        { model: db.Allcode, as: 'statusData', attributes: ['value', 'code'] },
                    ],
                    raw: true,
                    nest: true
                })
                let product = await db.Product.findOne({
                    where: { id: id },
                    raw: false
                })
                if (!res || !product || (res.statusId !== 'S1' && !['R1', 'R4'].includes(actor?.roleId))) return resolve({errCode: 2, errMessage: 'Sản phẩm không tồn tại'});
                product.view = (product.view || 0) + 1
                await product.save()

                res.productDetail = await db.ProductDetail.findAll({
                    where: { productId: res.id }
                })
                for (let i = 0; i < res.productDetail.length > 0; i++) {
                    res.productDetail[i].productImage = await db.ProductImage.findAll({ where: { productdetailId: res.productDetail[i].id } })

                    res.productDetail[i].productDetailSize = await db.ProductDetailSize.findAll({
                        where: { productdetailId: res.productDetail[i].id },
                        include: [
                            { model: db.Allcode, as: 'sizeData', attributes: ['value', 'code'] },

                        ],
                        raw: true,
                        nest: true
                    })
                    for (let j = 0; j < res.productDetail[i].productImage.length; j++) {
                        res.productDetail[i].productImage[j].image = decodeImage(res.productDetail[i].productImage[j].image)
                    }
                    for (let k = 0; k < res.productDetail[i].productDetailSize.length; k++) {
                        let receiptDetail = await db.ReceiptDetail.findAll({ where: { productDetailSizeId: res.productDetail[i].productDetailSize[k].id } })
                        let orderDetail = await db.OrderDetail.findAll({ where: { productId: res.productDetail[i].productDetailSize[k].id } })
                        let quantity = 0
                        for (let g = 0; g < receiptDetail.length; g++) {
                            quantity = quantity + receiptDetail[g].quantity
                        }
                        for (let h = 0; h < orderDetail.length; h++) {
                            let order = await db.OrderProduct.findOne({ where: { id: orderDetail[h].orderId } })
                            if (order && order.statusId != 'S7') {

                                quantity = quantity - orderDetail[h].quantity
                            }

                        }



                        res.productDetail[i].productDetailSize[k].stock = await commerce.availableStock(res.productDetail[i].productDetailSize[k].id)
                    }
                }
                resolve({
                    errCode: 0,
                    data: res
                })
            }

        } catch (error) {
            reject(error)
        }
    })
}
let updateProduct = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id || !data.categoryId || !data.brandId) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let product = await db.Product.findOne({
                    where: { id: data.id },
                    raw: false
                })
                if (product) {
                    product.name = data.name;
                    product.material = data.material;
                    product.madeby = data.madeby;
                    product.brandId = data.brandId;
                    product.categoryId = data.categoryId;
                    product.contentMarkdown = data.contentMarkdown;
                    product.contentHTML = data.contentHTML;

                    await product.save()
                    resolve({
                        errCode: 0,
                        errMessage: ''
                    })
                }
            }

        } catch (error) {
            reject(error)
        }
    })
}
let getAllProductDetailById = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let productdetail = await db.ProductDetail.findAndCountAll({
                    where: { productId: data.id },
                    limit: Math.min(100, Math.max(1, Number(data.limit) || 20)),
                    offset: Math.max(0, Number(data.offset) || 0),
                })
                if (productdetail.rows && productdetail.rows.length > 0) {
                    for (let i = 0; i < productdetail.rows.length; i++) {
                        productdetail.rows[i].productImageData = await db.ProductImage.findAll({
                            where: { productdetailId: productdetail.rows[i].id }
                        })
                        productdetail.rows[i].productsize = await db.ProductDetailSize.findAll({
                            where: { productdetailId: productdetail.rows[i].id }
                        })
                        if (productdetail.rows[i].productImageData && productdetail.rows[i].productImageData.length > 0) {
                            for (let j = 0; j < productdetail.rows[i].productImageData.length > 0; j++) {
                                productdetail.rows[i].productImageData[j].image = decodeImage(productdetail.rows[i].productImageData[j].image)
                            }
                        }

                    }
                }
                resolve({
                    errCode: 0,
                    data: productdetail.rows,
                    count: productdetail.count
                })
            }

        } catch (error) {
            reject(error)
        }
    })
}
let getAllProductDetailImageById = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let productImage = await db.ProductImage.findAndCountAll({
                    where: { productdetailId: data.id },
                    limit: Math.min(100, Math.max(1, Number(data.limit) || 20)),
                    offset: Math.max(0, Number(data.offset) || 0),
                })
                if (productImage.rows && productImage.rows.length > 0) {
                    productImage.rows.map(item => item.image = decodeImage(item.image))
                }

                resolve({
                    errCode: 0,
                    data: productImage.rows,
                    count: productImage.count
                })
            }

        } catch (error) {
            reject(error)
        }
    })
}
let createNewProductDetail = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.image || !data.nameDetail || !data.originalPrice || !data.discountPrice || !data.id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {

                let productdetail = await db.ProductDetail.create({
                    productId: data.id,
                    description: data.description,
                    originalPrice: data.originalPrice,
                    discountPrice: data.discountPrice,
                    nameDetail: data.nameDetail
                })
                if (productdetail) {
                    await db.ProductImage.create({

                        productdetailId: productdetail.id,
                        image: data.image
                    })
                    await db.ProductDetailSize.create({
                        productdetailId: productdetail.id,
                        width: data.width,
                        height: data.height,
                        sizeId: data.sizeId,
                        weight: data.weight
                    })
                }
                resolve({
                    errCode: 0,
                    errMessage: 'ok'
                })
            }


        } catch (error) {
            reject(error)
        }
    })
}
let updateProductDetail = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.nameDetail || !data.originalPrice || !data.discountPrice || !data.id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {

                let productDetail = await db.ProductDetail.findOne({
                    where: { id: data.id },
                    raw: false
                })
                if (productDetail) {
                    productDetail.nameDetail = data.nameDetail
                    productDetail.originalPrice = data.originalPrice
                    productDetail.discountPrice = data.discountPrice
                    productDetail.description = data.description
                    await productDetail.save();
                    resolve({
                        errCode: 0,
                        errMessage: 'ok'
                    })
                } else {
                    resolve({
                        errCode: 2,
                        errMessage: 'Product not found!'
                    })
                }

            }


        } catch (error) {
            reject(error)
        }
    })
}
let getDetailProductDetailById = (id) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let productdetail = await db.ProductDetail.findOne({
                    where: { id: id },
                })

                resolve({
                    errCode: 0,
                    data: productdetail
                })
            }

        } catch (error) {
            reject(error)
        }
    })
}
let createNewProductDetailImage = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.image || !data.caption || !data.id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                await db.ProductImage.create({
                    productdetailId: data.id,
                    caption: data.caption,
                    image: data.image
                })
                resolve({
                    errCode: 0,
                    errMessage: 'ok'
                })
            }


        } catch (error) {
            reject(error)
        }
    })
}
let getDetailProductImageById = (id) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let productdetailImage = await db.ProductImage.findOne({
                    where: { id: id },
                })
                if (productdetailImage) {
                    productdetailImage.image = decodeImage(productdetailImage.image);
                }
                resolve({
                    errCode: 0,
                    data: productdetailImage
                })
            }

        } catch (error) {
            reject(error)
        }
    })
}
let updateProductDetailImage = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id || !data.caption || !data.image) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {

                let productImage = await db.ProductImage.findOne({
                    where: { id: data.id },
                    raw: false
                })
                if (productImage) {
                    productImage.caption = data.caption
                    productImage.image = data.image


                    await productImage.save();
                    resolve({
                        errCode: 0,
                        errMessage: 'ok'
                    })
                } else {
                    resolve({
                        errCode: 2,
                        errMessage: 'Product Image not found!'
                    })
                }

            }


        } catch (error) {
            reject(error)
        }
    })
}
let deleteProductDetailImage = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {

                let productImage = await db.ProductImage.findOne({
                    where: { id: data.id },
                    raw: false
                })
                if (productImage) {
                    await db.ProductImage.destroy({
                        where: { id: data.id }
                    })
                    resolve({
                        errCode: 0,
                        errMessage: 'ok'
                    })
                } else {
                    resolve({
                        errCode: 2,
                        errMessage: 'Product Image not found!'
                    })
                }

            }


        } catch (error) {
            reject(error)
        }
    })
}
const deleteProductDetail = data => resultOf(async () => {
    if (!positiveInteger(data.id)) fail('Mã chi tiết sản phẩm không hợp lệ.');
    return commerce.transaction(async tx => {
        const detail = await db.ProductDetail.findByPk(data.id, { transaction: tx, raw: false });
        if (!detail) fail('Chi tiết sản phẩm không tồn tại.', 2);
        const variants = await db.ProductDetailSize.findAll({ where: { productdetailId: data.id }, transaction: tx, raw: true });
        await commerce.lockVariants(variants.map(variant => ({ productId: variant.id })), tx);
        for (const variant of variants) await assertUnusedVariant(variant.id, tx);
        await db.ProductImage.destroy({ where: { productdetailId: data.id }, transaction: tx });
        await db.ProductDetailSize.destroy({ where: { productdetailId: data.id }, transaction: tx });
        await detail.destroy({ transaction: tx });
        return { errCode: 0, errMessage: 'ok' };
    });
});
async function assertUnusedVariant(id, tx) {
    if (await db.ReceiptDetail.count({ where: { productDetailSizeId: id }, transaction: tx }) ||
        await db.OrderDetail.count({ where: { productId: id }, transaction: tx }) ||
        await db.ShopCart.count({ where: { productdetailsizeId: id }, transaction: tx }) ||
        (await commerce.activeSessions(tx)).some(session => session.checkout.lines.some(line => Number(line.productId) === Number(id)))) {
        fail('Không thể xóa biến thể đang có trong giỏ hàng, phiếu nhập hoặc đơn hàng. Hãy ngừng kinh doanh sản phẩm thay vì xóa.', 2);
    }
}
let getAllProductDetailSizeById = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let productsize = await db.ProductDetailSize.findAndCountAll({
                    where: { productdetailId: data.id },
                    limit: Math.min(100, Math.max(1, Number(data.limit) || 20)),
                    offset: Math.max(0, Number(data.offset) || 0),
                    include: [
                        { model: db.Allcode, as: 'sizeData', attributes: ['value', 'code'] },

                    ],
                    raw: true,
                    nest: true
                })
                for (let i = 0; i < productsize.rows.length > 0; i++) {
                    let receiptDetail = await db.ReceiptDetail.findAll({ where: { productDetailSizeId: productsize.rows[i].id } })
                    let orderDetail = await db.OrderDetail.findAll({ where: { productId: productsize.rows[i].id } })
                    let quantity = 0
                    for (let j = 0; j < receiptDetail.length; j++) {
                        quantity = quantity + receiptDetail[j].quantity
                    }
                    for (let k = 0; k < orderDetail.length; k++) {
                        let order = await db.OrderProduct.findOne({ where: { id: orderDetail[k].orderId } })
                        if (order && order.statusId != 'S7') {

                            quantity = quantity - orderDetail[k].quantity
                        }

                    }



                    productsize.rows[i].stock = await commerce.availableStock(productsize.rows[i].id)
                }
                resolve({
                    errCode: 0,
                    data: productsize.rows,
                    count: productsize.count
                })
            }

        } catch (error) {
            reject(error)
        }
    })
}
let createNewProductDetailSize = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.productdetailId || !data.sizeId) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                await db.ProductDetailSize.create({
                    productdetailId: data.productdetailId,
                    sizeId: data.sizeId,
                    width: data.width,
                    height: data.height,
                    weight: data.weight,
                })
                resolve({
                    errCode: 0,
                    errMessage: 'ok'
                })
            }


        } catch (error) {
            reject(error)
        }
    })
}
let getDetailProductDetailSizeById = (id) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let res = await db.ProductDetailSize.findOne({
                    where: { id: id },
                })

                resolve({
                    errCode: 0,
                    data: res
                })
            }

        } catch (error) {
            reject(error)
        }
    })
}
let updateProductDetailSize = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id || !data.sizeId) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {

                let res = await db.ProductDetailSize.findOne({
                    where: { id: data.id },
                    raw: false
                })
                if (res) {
                    res.sizeId = data.sizeId
                    res.width = data.width
                    res.height = data.height

                    res.weight = data.weight
                    await res.save();
                    resolve({
                        errCode: 0,
                        errMessage: 'ok'
                    })
                } else {
                    resolve({
                        errCode: 2,
                        errMessage: 'Product Image not found!'
                    })
                }

            }


        } catch (error) {
            reject(error)
        }
    })
}
const deleteProductDetailSize = data => resultOf(async () => {
    if (!positiveInteger(data.id)) fail('Mã kích thước không hợp lệ.');
    return commerce.transaction(async tx => {
        await commerce.lockVariants([{ productId: Number(data.id) }], tx);
        await assertUnusedVariant(data.id, tx);
        await db.ProductDetailSize.destroy({ where: { id: data.id }, transaction: tx });
        return { errCode: 0, errMessage: 'ok' };
    });
});
let getProductFeature = (limit) => {
    return new Promise(async (resolve, reject) => {
        try {
            let res = await db.Product.findAll({
                where: { statusId: 'S1' },
                include: [
                    { model: db.Allcode, as: 'brandData', attributes: ['value', 'code'] },
                    { model: db.Allcode, as: 'categoryData', attributes: ['value', 'code'] },
                    { model: db.Allcode, as: 'statusData', attributes: ['value', 'code'] },
                ],

                limit: storefrontLimit(limit),
                order: [['view', 'DESC'], ['id', 'DESC']],
                raw: true,
                nest: true
            })
            for (let i = 0; i < res.length; i++) {
                let objectFilterProductDetail = {
                    where: { productId: res[i].id }, raw: true
                }

                res[i].productDetail = await db.ProductDetail.findAll(objectFilterProductDetail)

                for (let j = 0; j < res[i].productDetail.length; j++) {
                    res[i].productDetail[j].productDetailSize = await db.ProductDetailSize.findAll({ where: { productdetailId: res[i].productDetail[j].id }, raw: true })

                    res[i].price = res[i].productDetail[0].discountPrice
                    res[i].productDetail[j].productImage = await db.ProductImage.findAll({ where: { productdetailId: res[i].productDetail[j].id }, raw: true })
                    for (let k = 0; k < res[i].productDetail[j].productImage.length > 0; k++) {
                        res[i].productDetail[j].productImage[k].image = decodeImage(res[i].productDetail[j].productImage[k].image)
                    }
                }
            }


            resolve({
                errCode: 0,
                data: res
            })


        } catch (error) {
            reject(error)
        }
    })
}
let getProductNew = (limit) => {
    return new Promise(async (resolve, reject) => {
        try {
            let res = await db.Product.findAll({
                where: { statusId: 'S1' },
                include: [
                    { model: db.Allcode, as: 'brandData', attributes: ['value', 'code'] },
                    { model: db.Allcode, as: 'categoryData', attributes: ['value', 'code'] },
                    { model: db.Allcode, as: 'statusData', attributes: ['value', 'code'] },
                ],
                limit: storefrontLimit(limit),
                order: [['createdAt', 'DESC'], ['id', 'DESC']],
                raw: true,
                nest: true
            })
            for (let i = 0; i < res.length; i++) {
                let objectFilterProductDetail = {
                    where: { productId: res[i].id }, raw: true
                }

                res[i].productDetail = await db.ProductDetail.findAll(objectFilterProductDetail)

                for (let j = 0; j < res[i].productDetail.length; j++) {
                    res[i].productDetail[j].productDetailSize = await db.ProductDetailSize.findAll({ where: { productdetailId: res[i].productDetail[j].id }, raw: true })

                    res[i].price = res[i].productDetail[0].discountPrice
                    res[i].productDetail[j].productImage = await db.ProductImage.findAll({ where: { productdetailId: res[i].productDetail[j].id }, raw: true })
                    for (let k = 0; k < res[i].productDetail[j].productImage.length > 0; k++) {
                        res[i].productDetail[j].productImage[k].image = decodeImage(res[i].productDetail[j].productImage[k].image)
                    }
                }
            }


            resolve({
                errCode: 0,
                data: res
            })


        } catch (error) {
            reject(error)
        }
    })
}
let getProductShopCart = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            let productArr = []
            if (!data.userId && !data.limit) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let shopcart = await db.ShopCart.findAll({ where: { userId: data.userId } })

                for (let i = 0; i < shopcart.length; i++) {
                    let productDetailSize = await db.ProductDetailSize.findOne({ where: { id: shopcart[i].productdetailsizeId } })

                    let productDetail = await db.ProductDetail.findOne({ where: { id: productDetailSize.productdetailId } })

                    let product = await db.Product.findOne({
                        where: { id: productDetail.productId },
                        include: [
                            { model: db.Allcode, as: 'brandData', attributes: ['value', 'code'] },
                            { model: db.Allcode, as: 'categoryData', attributes: ['value', 'code'] },
                            { model: db.Allcode, as: 'statusData', attributes: ['value', 'code'] },
                        ],

                        limit: Math.min(100, Math.max(1, Number(data.limit) || 20)),
                        order: [['view', 'DESC']],
                        raw: true,
                        nest: true
                    })
                    productArr.push(product)

                }

                if (productArr && productArr.length > 0) {
                    for (let g = 0; g < productArr.length; g++) {
                        let objectFilterProductDetail = {
                            where: { productId: productArr[g].id }, raw: true
                        }

                        productArr[g].productDetail = await db.ProductDetail.findAll(objectFilterProductDetail)

                        for (let j = 0; j < productArr[g].productDetail.length; j++) {
                            productArr[g].productDetail[j].productDetailSize = await db.ProductDetailSize.findAll({ where: { productdetailId: productArr[g].productDetail[j].id }, raw: true })

                            productArr[g].price = productArr[g].productDetail[0].discountPrice
                            productArr[g].productDetail[j].productImage = await db.ProductImage.findAll({ where: { productdetailId: productArr[g].productDetail[j].id }, raw: true })
                            for (let k = 0; k < productArr[g].productDetail[j].productImage.length > 0; k++) {
                                productArr[g].productDetail[j].productImage[k].image = decodeImage(productArr[g].productDetail[j].productImage[k].image)
                            }
                        }
                    }
                }


            }



            resolve({
                errCode: 0,
                data: productArr
            })


        } catch (error) {
            reject(error)
        }
    })
}
let getProductRecommend = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            let productArr = []
            if (!data.userId && !data.limit) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                const limit = storefrontLimit(data.limit);
                let recommender = new jsrecommender.Recommender();

                let table = new jsrecommender.Table();
                let rateList = await db.Comment.findAll({
                    where: {
                        star: { [Op.not]: null }
                    }
                })

                for (let i = 0; i < rateList.length; i++) {
                    table.setCell(`${rateList[i].productId}`, `${rateList[i].userId}`, rateList[i].star)
                }
                let model = recommender.fit(table);
                let predicted_table = recommender.transform(table);

                for (let i = 0; i < predicted_table.columnNames.length; ++i) {
                    let user = predicted_table.columnNames[i];

                    for (let j = 0; j < predicted_table.rowNames.length; ++j) {
                        let product = predicted_table.rowNames[j];
                        if (user == data.userId && Math.round(predicted_table.getCell(product, user)) > 3) {
                            if (productArr.length >= limit) {
                                break;
                            }
                            let productdata = await db.Product.findOne({ where: { id: product, statusId: 'S1' } })
                            if (productdata) productArr.push(productdata)


                        }

                    }
                }
                if (productArr && productArr.length > 0) {
                    for (let g = 0; g < productArr.length; g++) {
                        let objectFilterProductDetail = {
                            where: { productId: productArr[g].id }, raw: true
                        }

                        productArr[g].productDetail = await db.ProductDetail.findAll(objectFilterProductDetail)

                        for (let j = 0; j < productArr[g].productDetail.length; j++) {
                            productArr[g].productDetail[j].productDetailSize = await db.ProductDetailSize.findAll({ where: { productdetailId: productArr[g].productDetail[j].id }, raw: true })

                            productArr[g].price = productArr[g].productDetail[0].discountPrice
                            productArr[g].productDetail[j].productImage = await db.ProductImage.findAll({ where: { productdetailId: productArr[g].productDetail[j].id }, raw: true })
                            for (let k = 0; k < productArr[g].productDetail[j].productImage.length > 0; k++) {
                                productArr[g].productDetail[j].productImage[k].image = decodeImage(productArr[g].productDetail[j].productImage[k].image)
                            }
                        }
                    }
                }

                resolve({
                    errCode: 0,
                    data: productArr
                })

            }





        } catch (error) {
            reject(error)
        }
    })
}
module.exports = {
    createNewProduct: createNewProduct,
    getAllProductAdmin: getAllProductAdmin,
    getAllProductUser: getAllProductUser,
    UnactiveProduct: UnactiveProduct,
    ActiveProduct: ActiveProduct,
    getDetailProductById: getDetailProductById,
    updateProduct: updateProduct,
    getAllProductDetailById: getAllProductDetailById,
    getAllProductDetailImageById: getAllProductDetailImageById,
    createNewProductDetail: createNewProductDetail,
    updateProductDetail: updateProductDetail,
    getDetailProductDetailById: getDetailProductDetailById,
    createNewProductDetailImage: createNewProductDetailImage,
    getDetailProductImageById: getDetailProductImageById,
    updateProductDetailImage: updateProductDetailImage,
    deleteProductDetailImage: deleteProductDetailImage,
    deleteProductDetail: deleteProductDetail,
    getAllProductDetailSizeById: getAllProductDetailSizeById,
    createNewProductDetailSize: createNewProductDetailSize,
    getDetailProductDetailSizeById: getDetailProductDetailSizeById,
    updateProductDetailSize: updateProductDetailSize,
    deleteProductDetailSize: deleteProductDetailSize,
    getProductFeature: getProductFeature,
    getProductNew: getProductNew,
    getProductShopCart: getProductShopCart,
    getProductRecommend: getProductRecommend
}
