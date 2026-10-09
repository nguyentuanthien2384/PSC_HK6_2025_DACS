import db from "../models/index";
require('dotenv').config();
const { Op } = require("sequelize");
let createNewBlog = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.title || !data.contentMarkdown || !data.contentHTML || !data.image || !data.subjectId || !data.userId) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter !'
                })
            } else {
                await db.Blog.create({
                    shortdescription: data.shortdescription,
                    title: data.title,
                    subjectId: data.subjectId,
                    statusId: 'S1',
                    image: data.image,
                    contentMarkdown: data.contentMarkdown,
                    contentHTML: data.contentHTML,
                    userId:data.userId,
                    view:0
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
let getDetailBlogById = (id) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter !'
                })
            } else {
                let blog = await db.Blog.findOne({
                    where:{id:id},
                    raw:false
                })
                if (!blog) return resolve({errCode: 2, errMessage: 'Bài viết không tồn tại'});
                blog.view = (blog.view || 0) +1;
                await blog.save()
                let res = await db.Blog.findOne({
                    where: { id: id },
                    include: [
                        { model: db.Allcode, as: 'subjectData', attributes: ['value', 'code'] },

                    ],
                    raw: true,
                    nest: true
                })
                res.userData = await db.User.findOne({where:{id:res.userId}, attributes: ['id', 'firstName', 'lastName']})
              
                if (res && res.image) {
                    res.image = Buffer.from(res.image, 'base64').toString('binary');
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
let getAllBlog = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            let objectFilter = {
                where: { statusId: 'S1' },
                include: [
                    { model: db.Allcode, as: 'subjectData', attributes: ['value', 'code'] },

                ],
                raw: true,
                nest: true
            }
            if (Number(data.limit) > 0) {
                objectFilter.limit = Math.min(100, Math.max(1, Number(data.limit) || 20))
                objectFilter.offset = Math.max(0, Number(data.offset) || 0)
            }
            if(data.subjectId && data.subjectId !== ''){
            
                objectFilter.where = {...objectFilter.where, subjectId: data.subjectId}
            }
            if (typeof data.keyword === 'string' && data.keyword.trim()) objectFilter.where = {...objectFilter.where, title: {[Op.substring]: data.keyword  } }
            let res = await db.Blog.findAndCountAll(objectFilter)
            if (res.rows && res.rows.length > 0) {
                for(let i=0; i< res.rows.length; i++){
                    res.rows[i].image = Buffer.from(res.rows[i].image, 'base64').toString('binary')
                    res.rows[i].userData = await db.User.findOne({where:{id:res.rows[i].userId }, attributes: ['id', 'firstName', 'lastName']})
                    res.rows[i].commentData = await db.Comment.findAll({where:{blogId:res.rows[i].id }})
                }
               
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
let updateBlog = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id || !data.title || !data.contentMarkdown || !data.contentHTML || !data.image || !data.subjectId) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter !'
                })
            } else {
                let blog = await db.Blog.findOne({
                    where: { id: data.id },
                    raw: false
                })
                if (blog) {
                    blog.title = data.title;
                    blog.contentMarkdown = data.contentMarkdown;
                    blog.contentHTML = data.contentHTML;
                    blog.image = data.image;
                    blog.subjectId = data.subjectId
                    blog.shortdescription = data.shortdescription

                    await blog.save()
                    resolve({
                        errCode: 0,
                        errMessage: 'ok'
                    })
                } else resolve({errCode: 2, errMessage: 'Bài viết không tồn tại'});
            }

        } catch (error) {
            reject(error)
        }
    })
}
let deleteBlog = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.id) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter !'
                })
            } else {
                let blog = await db.Blog.findOne({
                    where: { id: data.id }
                })
                if (blog) {
                    await db.Blog.destroy({
                        where: { id: data.id }
                    })
                    resolve({
                        errCode: 0,
                        errMessage: 'ok'
                    })
                } else resolve({errCode: 2, errMessage: 'Bài viết không tồn tại'});
            }

        } catch (error) {
            reject(error)
        }
    })
}
let getFeatureBlog = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
        
            let res = await db.Blog.findAll({
                where: { statusId: 'S1' },
                include: [
                    { model: db.Allcode, as: 'subjectData', attributes: ['value', 'code'] },

                ],
                order: [['view', 'DESC']],
                limit:+data.limit,
                raw: true,
                nest: true
            })
            if (res && res.length > 0) {
                for(let i=0; i< res.length; i++){
                    res[i].image = Buffer.from(res[i].image, 'base64').toString('binary')
                    res[i].userData = await db.User.findOne({where:{id:res[i].userId }, attributes: ['id', 'firstName', 'lastName']})
                    res[i].commentData = await db.Comment.findAll({where:{blogId:res[i].id }})
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
let getNewBlog = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
        
            let res = await db.Blog.findAll({
                where: { statusId: 'S1' },
                include: [
                    { model: db.Allcode, as: 'subjectData', attributes: ['value', 'code'] },

                ],
                order: [['createdAt', 'DESC']],
                limit:+data.limit,
                raw: true,
                nest: true
            })
            if (res && res.length > 0) {
                for(let i=0; i< res.length; i++){
                    res[i].image = Buffer.from(res[i].image, 'base64').toString('binary')
                    res[i].userData = await db.User.findOne({where:{id:res[i].userId }, attributes: ['id', 'firstName', 'lastName']})
                    res[i].commentData = await db.Comment.findAll({where:{blogId:res[i].id }})
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
module.exports = {
    createNewBlog: createNewBlog,
    getDetailBlogById: getDetailBlogById,
    getAllBlog: getAllBlog,
    updateBlog: updateBlog,
    deleteBlog: deleteBlog,
    getFeatureBlog:getFeatureBlog,
    getNewBlog:getNewBlog
}
