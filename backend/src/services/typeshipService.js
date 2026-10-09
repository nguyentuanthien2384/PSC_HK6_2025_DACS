import db from "../models/index";
const { Op } = require("sequelize");

let createNewTypeShip = (data = {}) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.type || data.price === undefined || data.price === '' || !Number.isFinite(+data.price) || +data.price < 0) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter !'
                })
            } else {
                await db.TypeShip.create({
                    type: data.type,
                    price: +data.price
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
let getDetailTypeshipById = (id) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter !'
                })
            } else {
                let res = await db.TypeShip.findOne({
                    where: { id: id },
                })
                if (!res) return resolve({ errCode: 2, errMessage: 'Phương thức vận chuyển không tồn tại' });
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
let getAllTypeship = (data = {}) => {
    return new Promise(async (resolve, reject) => {
        try {
            let objectFilter = {}
            if (data.limit !== undefined) {
                objectFilter.limit = Math.min(100, Math.max(1, parseInt(data.limit, 10) || 20));
                objectFilter.offset = Math.max(0, parseInt(data.offset, 10) || 0);
            }
            if (typeof data.keyword === 'string' && data.keyword.trim()) objectFilter.where = { type: { [Op.substring]: data.keyword.trim() } };
            let res = await db.TypeShip.findAndCountAll(objectFilter)

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
let updateTypeship = (data = {}) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id || !data.type || data.price === undefined || data.price === '' || !Number.isFinite(+data.price) || +data.price < 0) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter !'
                })
            } else {
                let typeship = await db.TypeShip.findOne({
                    where: { id: data.id },
                    raw: false
                })
                if (typeship) {
                    typeship.type = data.type;
                    typeship.price = +data.price;
                    await typeship.save()
                    resolve({
                        errCode: 0,
                        errMessage: 'ok'
                    })
                } else resolve({ errCode: 2, errMessage: 'Phương thức vận chuyển không tồn tại' });
            }

        } catch (error) {
            reject(error)
        }
    })
}
let deleteTypeship = (data = {}) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter !'
                })
            } else {
                let typeship = await db.TypeShip.findOne({
                    where: { id: data.id }
                })
                if (typeship) {
                    await db.TypeShip.destroy({
                        where: { id: data.id }
                    })
                    resolve({
                        errCode: 0,
                        errMessage: 'ok'
                    })
                } else resolve({ errCode: 2, errMessage: 'Phương thức vận chuyển không tồn tại' });
            }

        } catch (error) {
            reject(error)
        }
    })
}
module.exports = {
    createNewTypeShip: createNewTypeShip,
    getDetailTypeshipById: getDetailTypeshipById,
    getAllTypeship: getAllTypeship,
    updateTypeship: updateTypeship,
    deleteTypeship: deleteTypeship
}
