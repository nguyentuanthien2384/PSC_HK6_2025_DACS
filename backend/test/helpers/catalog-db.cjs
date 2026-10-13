const { Op } = require('sequelize');

function catalogDb({ products = [], details = [], images = [], sizes = [], ratings = [], carts = [] } = {}) {
    const queries = [];
    function matches(row, where = {}) {
        return Object.entries(where).every(([field, value]) => {
            if (typeof value !== 'object' || value === null) return String(row[field]) === String(value);
            if (Object.prototype.hasOwnProperty.call(value, Op.in)) return Array.isArray(value[Op.in]) ? value[Op.in].map(String).includes(String(row[field])) : true;
            if (Object.prototype.hasOwnProperty.call(value, Op.substring)) return String(row[field]).includes(value[Op.substring]);
            return true;
        });
    }
    const project = (row, attributes) => attributes ? Object.fromEntries(attributes.filter(field => typeof field === 'string').map(field => [field, row[field]])) : { ...row };
    function queryRows(rows, query = {}) {
        return rows.filter(row => matches(row, query.where)).sort((left, right) => {
            for (const [field, direction] of query.order || []) {
                let leftValue = left[field], rightValue = right[field];
                if (field?.val?.startsWith('(SELECT')) {
                    leftValue = details.filter(detail => detail.productId === left.id).sort((a, b) => a.id - b.id)[0]?.discountPrice;
                    rightValue = details.filter(detail => detail.productId === right.id).sort((a, b) => a.id - b.id)[0]?.discountPrice;
                } else if (field?.val?.startsWith('CASE')) {
                    const ranks = new Map([...field.val.matchAll(/WHEN (\d+) THEN (\d+)/g)].map(match => [Number(match[1]), Number(match[2])]));
                    leftValue = ranks.get(left.id); rightValue = ranks.get(right.id);
                }
                const difference = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
                if (difference) return direction === 'DESC' ? -difference : difference;
            }
            return 0;
        }).slice(query.offset || 0, query.limit ? (query.offset || 0) + query.limit : undefined).map(row => project(row, query.attributes));
    }
    const table = (name, rows) => ({
        async findAll(query) { queries.push({ name, query }); return queryRows(rows, query); },
        async findAndCountAll(query) { queries.push({ name, query, sqlCount: 2 }); return { rows: queryRows(rows, query), count: rows.filter(row => matches(row, query.where)).length }; },
    });
    return {
        queries,
        db: {
            Allcode: {}, Product: table('Product', products), ProductDetail: table('ProductDetail', details),
            ProductDetailSize: table('ProductDetailSize', sizes), ProductImage: table('ProductImage', images),
            Comment: table('Comment', ratings), ShopCart: table('ShopCart', carts),
        },
    };
}

module.exports = { catalogDb };
