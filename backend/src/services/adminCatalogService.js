const { Op, literal, Transaction } = require('sequelize');
const { resultOf, fail, CommerceError } = require('../utils/commerce');
const { productImageUrl } = require('../utils/productImage');

const safeId = value => (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
const manager = actor => { if (!actor || actor.roleId !== 'R1' || !safeId(actor.id)) fail('Bạn không có quyền quản lý danh mục sản phẩm.', 403); };
const day = (value, end = false) => {
    if (!value) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Ngày lọc không hợp lệ.');
    const parsed = new Date(`${value}T00:00:00+07:00`);
    if (!Number.isFinite(parsed.getTime()) || new Date(parsed.getTime() + 7 * 3600000).toISOString().slice(0, 10) !== value) fail('Ngày lọc không hợp lệ.');
    return new Date(parsed.getTime() + (end ? 86400000 : 0));
};
const minPrice = literal('(SELECT MIN(`adminPrice`.`discountPrice`) FROM `Productdetails` AS `adminPrice` WHERE `adminPrice`.`productId` = `Product`.`id`)');
const maxPrice = literal('(SELECT MAX(`adminPrice`.`discountPrice`) FROM `Productdetails` AS `adminPrice` WHERE `adminPrice`.`productId` = `Product`.`id`)');
const variants = literal('(SELECT COUNT(*) FROM `ProductDetailSizes` AS `adminSize` INNER JOIN `Productdetails` AS `adminVariant` ON `adminSize`.`productdetailId` = `adminVariant`.`id` WHERE `adminVariant`.`productId` = `Product`.`id`)');
const sorting = { newest: [['createdAt', 'DESC']], oldest: [['createdAt', 'ASC']], nameAsc: [['name', 'ASC']], nameDesc: [['name', 'DESC']], priceAsc: [[minPrice, 'ASC']], priceDesc: [[maxPrice, 'DESC']], viewsDesc: [['view', 'DESC']] };

function createAdminCatalogService(db, options = {}) {
    const audit = options.recordAdminAudit || ((...args) => require('./adminAuditService').recordAdminAudit(...args));
    const imageUrl = options.imageUrl || productImageUrl;
    const list = (data = {}, actor) => resultOf(async () => {
        manager(actor);
        const page = data.page === undefined ? 1 : Number(data.page), pageSize = data.pageSize === undefined ? 20 : Number(data.pageSize);
        if (!safeId(data.page ?? 1) || page > 100000 || !safeId(data.pageSize ?? 20) || pageSize > 50) fail('Phân trang không hợp lệ (tối đa 50 sản phẩm mỗi trang).');
        const where = {};
        if (data.statusId && data.statusId !== 'ALL') {
            if (!['S1', 'S2'].includes(data.statusId)) fail('Trạng thái sản phẩm không hợp lệ.');
            where.statusId = data.statusId;
        }
        for (const key of ['categoryId', 'brandId']) {
            if (data[key] && data[key] !== 'ALL') {
                if (typeof data[key] !== 'string' || data[key].length > 100) fail('Danh mục hoặc thương hiệu không hợp lệ.');
                where[key] = data[key];
            }
        }
        if (data.keyword != null) {
            if (typeof data.keyword !== 'string' || data.keyword.length > 200) fail('Từ khóa quá dài hoặc không hợp lệ.');
            if (data.keyword.trim()) where.name = { [Op.like]: `%${data.keyword.trim().replace(/[\\%_]/g, '\\$&')}%` };
        }
        const from = day(data.fromDate), until = day(data.toDate, true);
        if (from && until && from >= until) fail('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
        if (from || until) where.createdAt = { ...(from ? { [Op.gte]: from } : {}), ...(until ? { [Op.lt]: until } : {}) };
        const sort = data.sort || 'newest';
        if (!sorting[sort]) fail('Kiểu sắp xếp không hợp lệ.');
        const result = await db.Product.findAndCountAll({
            where, attributes: ['id', 'name', 'statusId', 'categoryId', 'brandId', 'view', 'createdAt', 'updatedAt', [minPrice, 'priceMin'], [maxPrice, 'priceMax'], [variants, 'variantCount']],
            include: ['categoryData', 'brandData'].map(as => ({ model: db.Allcode, as, attributes: ['code', 'value'] })),
            limit: pageSize, offset: (page - 1) * pageSize, order: [...sorting[sort], ['id', 'DESC']], raw: true, nest: true,
        });
        const ids = result.rows.map(row => Number(row.id));
        const images = ids.length ? await db.ProductImage.findAll({
            attributes: ['id', 'productdetailId', 'imageVersion', 'updatedAt', [literal('(SELECT `adminImageDetail`.`productId` FROM `Productdetails` AS `adminImageDetail` WHERE `adminImageDetail`.`id` = `ProductImage`.`productdetailId`)'), 'productId']],
            where: { id: { [Op.in]: literal(`(SELECT MIN(\`adminImage\`.\`id\`) FROM \`Productimages\` AS \`adminImage\` INNER JOIN \`Productdetails\` AS \`adminImageVariant\` ON \`adminImageVariant\`.\`id\` = \`adminImage\`.\`productdetailId\` WHERE \`adminImageVariant\`.\`productId\` IN (${ids.join(',')}) GROUP BY \`adminImageVariant\`.\`productId\`)`) } }, raw: true,
        }) : [];
        const imageByProduct = new Map(images.map(image => [Number(image.productId), imageUrl(image, 'card')]));
        const codes = await db.Allcode.findAll({ where: { type: { [Op.in]: ['CATEGORY', 'BRAND'] } }, attributes: ['code', 'type', 'value'], order: [['value', 'ASC']], raw: true });
        return { errCode: 0, count: result.count, page, pageSize, pages: Math.ceil(result.count / pageSize), data: result.rows.map(row => ({ ...row, image: imageByProduct.get(Number(row.id)) || '', variantCount: Number(row.variantCount) || 0, priceMin: row.priceMin == null ? null : Number(row.priceMin), priceMax: row.priceMax == null ? null : Number(row.priceMax) })), filters: { categories: codes.filter(code => code.type === 'CATEGORY'), brands: codes.filter(code => code.type === 'BRAND') } };
    });

    const updateStatus = (data = {}, actor) => resultOf(async () => {
        manager(actor);
        if (!Array.isArray(data.ids) || !data.ids.length || data.ids.length > 50 || data.ids.some(id => !safeId(id))) fail('Chọn từ 1 đến 50 sản phẩm hợp lệ.');
        if (!['S1', 'S2'].includes(data.statusId)) fail('Chỉ có thể ẩn hoặc hiện sản phẩm.');
        const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
        if (reason.length < 3 || reason.length > 500) fail('Vui lòng nhập lý do từ 3 đến 500 ký tự.');
        const results = [];
        for (const id of [...new Set(data.ids.map(Number))].sort((a, b) => a - b)) {
            try {
                const outcome = await db.sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async tx => {
                    const product = await db.Product.findOne({ where: { id }, transaction: tx, lock: tx.LOCK.UPDATE });
                    if (!product) fail('Sản phẩm không còn tồn tại.', 2);
                    if (product.statusId === data.statusId) return 'skipped';
                    if (!['S1', 'S2'].includes(product.statusId)) fail('Trạng thái hiện tại không hỗ trợ thao tác này.', 2);
                    const before = { statusId: product.statusId };
                    product.statusId = data.statusId;
                    await product.save({ transaction: tx });
                    await audit(db, { actor, entityType: 'PRODUCT', entityId: id, action: data.statusId === 'S2' ? 'PRODUCT_HIDE' : 'PRODUCT_RESTORE', summary: reason, before, after: { statusId: data.statusId } }, tx);
                    return 'changed';
                });
                results.push({ id, outcome });
            } catch (error) {
                results.push({ id, outcome: 'failed', errMessage: error instanceof CommerceError ? error.message : 'Không thể lưu thay đổi và lịch sử thao tác. Vui lòng thử lại.' });
            }
        }
        return { errCode: 0, data: results, changed: results.filter(row => row.outcome === 'changed').length, skipped: results.filter(row => row.outcome === 'skipped').length, failed: results.filter(row => row.outcome === 'failed').length };
    });
    return { list, updateStatus };
}
module.exports = { createAdminCatalogService };
