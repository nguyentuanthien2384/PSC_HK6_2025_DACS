const { Op, literal } = require('sequelize');

const cardAttributes = ['id', 'name', 'statusId', 'categoryId', 'brandId', 'view', 'createdAt', 'updatedAt'];
const detailAttributes = ['id', 'productId', 'nameDetail', 'originalPrice', 'discountPrice'];
const imageAttributes = ['id', 'productdetailId', 'imageVersion', 'updatedAt'];
const listLimit = value => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.min(100, Math.max(1, Math.floor(number))) : 20;
};
const listOffset = value => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number)) : 0;
};
const truthy = value => value === true || value === 'true';
const numericIds = rows => [...new Set(rows.map(row => Number(row.id)).filter(id => Number.isSafeInteger(id) && id > 0))];

function createCatalogService(db, options = {}) {
    const imageUrl = options.imageUrl || require('../utils/productImage').productImageUrl;
    const associations = () => [
        { model: db.Allcode, as: 'brandData', attributes: ['value', 'code'] },
        { model: db.Allcode, as: 'categoryData', attributes: ['value', 'code'] },
        { model: db.Allcode, as: 'statusData', attributes: ['value', 'code'] },
    ];

    // The displayed price belongs to the first variant, so order it in SQL before LIMIT/OFFSET.
    const displayedPrice = literal('(SELECT `catalogDetail`.`discountPrice` FROM `Productdetails` AS `catalogDetail` WHERE `catalogDetail`.`productId` = `Product`.`id` ORDER BY `catalogDetail`.`id` ASC LIMIT 1)');

    async function hydrate(products, { admin = false } = {}) {
        if (!products.length) return products;
        const productIds = numericIds(products);
        const details = await db.ProductDetail.findAll({
            where: {
                productId: { [Op.in]: productIds },
                ...(admin ? {} : { id: { [Op.in]: literal(`(SELECT MIN(\`firstDetail\`.\`id\`) FROM \`Productdetails\` AS \`firstDetail\` WHERE \`firstDetail\`.\`productId\` IN (${productIds.join(',')}) GROUP BY \`firstDetail\`.\`productId\`)`) } }),
            }, attributes: detailAttributes,
            order: [['id', 'ASC']], raw: true,
        });
        const byProduct = new Map();
        for (const detail of details) {
            const id = Number(detail.productId);
            if (!byProduct.has(id)) byProduct.set(id, []);
            // Cards need one variant only; receipt selectors still receive every variant.
            if (admin || byProduct.get(id).length === 0) byProduct.get(id).push({ ...detail, productImage: [], productDetailSize: [] });
        }
        const selectedDetails = [...byProduct.values()].flat();
        const detailIds = numericIds(selectedDetails);
        const images = detailIds.length ? await db.ProductImage.findAll({
            where: {
                productdetailId: { [Op.in]: detailIds },
                ...(admin ? {} : { id: { [Op.in]: literal(`(SELECT MIN(\`catalogImage\`.\`id\`) FROM \`Productimages\` AS \`catalogImage\` WHERE \`catalogImage\`.\`productdetailId\` IN (${detailIds.join(',')}) GROUP BY \`catalogImage\`.\`productdetailId\`)`) } }),
            },
            attributes: imageAttributes, order: [['id', 'ASC']], raw: true,
        }) : [];
        const byDetail = new Map(selectedDetails.map(detail => [Number(detail.id), detail]));
        for (const image of images) {
            const detail = byDetail.get(Number(image.productdetailId));
            if (detail && (admin || !detail.productImage.length)) detail.productImage.push({ ...image, image: imageUrl(image, 'card') });
        }
        if (admin && detailIds.length) {
            const sizes = await db.ProductDetailSize.findAll({
                where: { productdetailId: { [Op.in]: detailIds } }, order: [['id', 'ASC']], raw: true,
            });
            for (const size of sizes) byDetail.get(Number(size.productdetailId))?.productDetailSize.push(size);
        }
        return products.map(product => {
            const productDetail = byProduct.get(Number(product.id)) || [];
            return { ...product, price: productDetail[0]?.discountPrice ?? null, productDetail };
        });
    }

    function productQuery(where, order) {
        return { where, attributes: cardAttributes, include: associations(), order, raw: true, nest: true };
    }

    async function list(data = {}, { admin = false } = {}) {
        const where = admin ? {} : { statusId: 'S1' };
        if (data.categoryId && data.categoryId !== 'ALL') where.categoryId = data.categoryId;
        if (data.brandId && data.brandId !== 'ALL') where.brandId = data.brandId;
        if (typeof data.keyword === 'string' && data.keyword.trim()) where.name = { [Op.substring]: data.keyword.trim() };
        const order = [];
        if (truthy(data.sortPrice)) order.push([displayedPrice, 'ASC']);
        if (truthy(data.sortName)) order.push(['name', 'ASC']);
        order.push(['id', 'ASC']);
        const query = productQuery(where, order);
        // Empty limit is used by the existing admin receipt selector to load its full option list.
        if (!admin || Number(data.limit) > 0) Object.assign(query, { limit: listLimit(data.limit), offset: listOffset(data.offset) });
        if (admin) query.attributes = [...cardAttributes, 'madeby', 'material'];
        const result = await db.Product.findAndCountAll(query);
        return { errCode: 0, count: result.count, data: await hydrate(result.rows, { admin }) };
    }

    async function featured(limit) {
        const products = await db.Product.findAll({ ...productQuery({ statusId: 'S1' }, [['view', 'DESC'], ['id', 'DESC']]), limit: listLimit(limit) });
        return { errCode: 0, data: await hydrate(products) };
    }

    async function newest(limit) {
        const products = await db.Product.findAll({ ...productQuery({ statusId: 'S1' }, [['createdAt', 'DESC'], ['id', 'DESC']]), limit: listLimit(limit) });
        return { errCode: 0, data: await hydrate(products) };
    }

    async function byRankedIds(ids, limit) {
        const safeIds = [...new Set(ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
        if (!safeIds.length) return [];
        const order = literal(`CASE \`Product\`.\`id\` ${safeIds.map((id, index) => `WHEN ${id} THEN ${index}`).join(' ')} END`);
        const products = await db.Product.findAll({
            ...productQuery({ id: { [Op.in]: safeIds }, statusId: 'S1' }, [[order, 'ASC'], ['id', 'ASC']]),
            limit: listLimit(limit),
        });
        return hydrate(products);
    }

    async function cart(data = {}) {
        if (!data.userId) return { errCode: 1, errMessage: 'Missing required parameter!' };
        const carts = await db.ShopCart.findAll({ where: { userId: data.userId }, attributes: ['productdetailsizeId'], raw: true });
        if (!carts.length) return { errCode: 0, data: [] };
        const variantIds = [...new Set(carts.map(row => Number(row.productdetailsizeId)))];
        const variants = await db.ProductDetailSize.findAll({ where: { id: { [Op.in]: variantIds } }, attributes: ['productdetailId'], raw: true });
        const details = variants.length ? await db.ProductDetail.findAll({ where: { id: { [Op.in]: [...new Set(variants.map(row => Number(row.productdetailId)))] } }, attributes: ['productId'], raw: true }) : [];
        return { errCode: 0, data: await byRankedIds(details.map(row => row.productId), data.limit) };
    }

    async function recommend(data = {}) {
        if (!data.userId) return { errCode: 1, errMessage: 'Missing required parameter!' };
        // A bounded sparse score avoids fitting a dense user × product matrix on each page request.
        const ratings = await db.Comment.findAll({
            where: { productId: { [Op.not]: null }, star: { [Op.between]: [1, 5] } },
            attributes: ['productId', 'userId', 'star'], order: [['id', 'DESC']], limit: 2000, raw: true,
        });
        const liked = new Set(ratings.filter(row => Number(row.userId) === Number(data.userId) && Number(row.star) >= 4).map(row => Number(row.productId)));
        const neighbors = new Map();
        for (const row of ratings) {
            if (liked.has(Number(row.productId)) && Number(row.star) >= 4 && Number(row.userId) !== Number(data.userId)) {
                neighbors.set(Number(row.userId), (neighbors.get(Number(row.userId)) || 0) + 1);
            }
        }
        const scores = new Map();
        for (const row of ratings) {
            const id = Number(row.productId);
            if (!Number.isSafeInteger(id) || id <= 0 || Number(row.star) < 4) continue;
            const current = scores.get(id) || { total: 0, count: 0, affinity: 0 };
            current.total += Number(row.star);
            current.count += 1;
            current.affinity += neighbors.get(Number(row.userId)) || 0;
            scores.set(id, current);
        }
        const ids = [...scores.entries()].sort(([leftId, left], [rightId, right]) =>
            (right.affinity - left.affinity) || ((right.total / right.count) - (left.total / left.count)) || (right.count - left.count) || (leftId - rightId)
        ).map(([id]) => id);
        return { errCode: 0, data: await byRankedIds(ids, data.limit) };
    }

    return { list, featured, newest, cart, recommend, hydrate };
}

module.exports = { createCatalogService, listLimit, listOffset };
