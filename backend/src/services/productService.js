import db from "../models/index";

require('dotenv').config();
const { Op, literal } = require("sequelize");
const { createCommerceService } = require('./commerceService');
const { resultOf, fail, positiveInteger, money } = require('../utils/commerce');
const commerce = createCommerceService(db);
const { createCatalogService } = require('./catalogService');
const catalog = createCatalogService(db);
const { productImageUrl } = require('../utils/productImage');
const { catalogStocks } = require('./catalogStockService');
const decodeImage = image => image == null ? '' : Buffer.from(image).toString('utf8');
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
const getAllProductAdmin = data => catalog.list(data, { admin: true });
const getAllProductUser = data => catalog.list(data);
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
const getDetailProductById = async (id, actor) => {
    if (!positiveInteger(id)) return { errCode: 1, errMessage: 'Missing required parameter!' };
    const product = await db.Product.findOne({
        where: { id },
        include: [
            { model: db.Allcode, as: 'brandData', attributes: ['value', 'code'] },
            { model: db.Allcode, as: 'categoryData', attributes: ['value', 'code'] },
            { model: db.Allcode, as: 'statusData', attributes: ['value', 'code'] },
        ], raw: true, nest: true,
    });
    if (!product || (product.statusId !== 'S1' && !['R1', 'R4'].includes(actor?.roleId))) return { errCode: 2, errMessage: 'Sản phẩm không tồn tại' };
    await db.Product.update({ view: literal('COALESCE(`view`, 0) + 1') }, { where: { id } });
    const details = await db.ProductDetail.findAll({ where: { productId: product.id }, order: [['id', 'ASC']], raw: true });
    const detailIds = details.map(detail => detail.id);
    const images = detailIds.length ? await db.ProductImage.findAll({
        where: { productdetailId: { [Op.in]: detailIds } },
        attributes: ['id', 'productdetailId', 'caption', 'imageVersion', 'updatedAt'], order: [['id', 'ASC']], raw: true,
    }) : [];
    const sizes = detailIds.length ? await db.ProductDetailSize.findAll({
        where: { productdetailId: { [Op.in]: detailIds } },
        include: [{ model: db.Allcode, as: 'sizeData', attributes: ['value', 'code'] }],
        order: [['id', 'ASC']], raw: true, nest: true,
    }) : [];
    const stocks = await catalogStocks(db, sizes.map(size => size.id));
    const byDetail = new Map(details.map(detail => [Number(detail.id), { ...detail, productImage: [], productDetailSize: [] }]));
    for (const image of images) byDetail.get(Number(image.productdetailId))?.productImage.push({ ...image, image: productImageUrl(image, 'detail') });
    for (const size of sizes) byDetail.get(Number(size.productdetailId))?.productDetailSize.push({ ...size, stock: stocks.get(Number(size.id)) || 0 });
    return { errCode: 0, data: { ...product, productDetail: details.map(detail => byDetail.get(Number(detail.id))) } };
};
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
const getAllProductDetailSizeById = async (data) => {
    if (!positiveInteger(data.id)) return { errCode: 1, errMessage: 'Missing required parameter!' };
    const result = await db.ProductDetailSize.findAndCountAll({
        where: { productdetailId: data.id },
        limit: Math.min(100, Math.max(1, Number(data.limit) || 20)),
        offset: Math.max(0, Number(data.offset) || 0),
        include: [{ model: db.Allcode, as: 'sizeData', attributes: ['value', 'code'] }],
        order: [['id', 'ASC']], raw: true, nest: true,
    });
    const stocks = await catalogStocks(db, result.rows.map(size => size.id));
    return { errCode: 0, count: result.count, data: result.rows.map(size => ({ ...size, stock: stocks.get(Number(size.id)) || 0 })) };
};
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
const getProductFeature = limit => catalog.featured(limit);
const getProductNew = limit => catalog.newest(limit);
const getProductShopCart = data => catalog.cart(data);
const getProductRecommend = data => catalog.recommend(data);
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
