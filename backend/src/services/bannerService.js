const db = require('../models');
const { Op } = require("sequelize");
const { contentImageUrl } = require('../utils/productImage');
let createNewBanner = (data = {}) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.image || !data.description || !data.name) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter !'
                })
            } else {
                await db.Banner.create({
                    name: data.name,
                    description: data.description,
                    image: data.image,
                    statusId: 'S1'
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
let getDetailBanner = (id) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter !'
                })
            } else {
                let res = await db.Banner.findOne({
                    where: { id: id }
                })
                if (!res) return resolve({ errCode: 2, errMessage: 'Banner không tồn tại' });
                if (Buffer.isBuffer(res.image)) res.image = res.image.toString('utf8');
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
function createBannerReadService(models) {
    return {
        async getAllBanner(data = {}) {
            const filter = {
                attributes: ['id', 'description', 'name', 'statusId', 'imageVersion', 'createdAt', 'updatedAt'],
                where: { statusId: 'S1' },
                order: [['id', 'ASC']],
                raw: true,
            };
            if (data.limit !== undefined) {
                filter.limit = Math.min(100, Math.max(1, parseInt(data.limit, 10) || 20));
                filter.offset = Math.max(0, parseInt(data.offset, 10) || 0);
            }
            if (typeof data.keyword === 'string' && data.keyword.trim()) filter.where.name = { [Op.substring]: data.keyword.trim() };
            const result = await models.Banner.findAndCountAll(filter);
            return {
                errCode: 0,
                data: result.rows.map(row => ({ ...row, image: contentImageUrl(row, 'banner', 'banner') })),
                count: result.count,
            };
        },
    };
}
const { getAllBanner } = createBannerReadService(db);
let updateBanner = (data = {}) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id || !data.image || !data.description || !data.name) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter !'
                })
            } else {
                let banner = await db.Banner.findOne({
                    where: { id: data.id },
                    raw: false
                })
                if (banner) {
                    banner.name = data.name;
                    banner.description = data.description;
                    banner.image = data.image;

                    await banner.save()
                    resolve({
                        errCode: 0,
                        errMessage: 'ok'
                    })
                } else resolve({ errCode: 2, errMessage: 'Banner không tồn tại' });
            }

        } catch (error) {
            reject(error)
        }
    })
}
let deleteBanner = (data = {}) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter !'
                })
            } else {
                let banner = await db.Banner.findOne({
                    where: { id: data.id }
                })
                if (banner) {
                    await db.Banner.destroy({
                        where: { id: data.id }
                    })
                    resolve({
                        errCode: 0,
                        errMessage: 'ok'
                    })
                } else resolve({ errCode: 2, errMessage: 'Banner không tồn tại' });
            }

        } catch (error) {
            reject(error)
        }
    })
}
module.exports = {
    createBannerReadService,
    createNewBanner: createNewBanner,
    getDetailBanner: getDetailBanner,
    getAllBanner: getAllBanner,
    updateBanner: updateBanner,
    deleteBanner: deleteBanner
}
