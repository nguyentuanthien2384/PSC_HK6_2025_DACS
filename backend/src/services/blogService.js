const db = require('../models');
const { Op } = require("sequelize");
const { contentImageUrl } = require('../utils/productImage');
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
const blogCardAttributes = ['id', 'shortdescription', 'title', 'subjectId', 'statusId', 'imageVersion', 'userId', 'view', 'createdAt', 'updatedAt'];
const boundedLimit = value => Math.min(100, Math.max(1, Math.floor(Number(value) || 20)));
function createBlogReadService(models) {
    const include = [{ model: models.Allcode, as: 'subjectData', attributes: ['value', 'code'] }];
    async function hydrateCards(rows) {
        if (!rows.length) return [];
        const ids = rows.map(row => row.id);
        const authorIds = [...new Set(rows.map(row => row.userId).filter(id => id !== null && id !== undefined))];
        const [authors, comments] = await Promise.all([
            authorIds.length ? models.User.findAll({ where: { id: { [Op.in]: authorIds } }, attributes: ['id', 'firstName', 'lastName'], raw: true }) : [],
            models.Comment.findAll({ where: { blogId: { [Op.in]: ids } }, attributes: ['id', 'blogId'], raw: true }),
        ]);
        const authorMap = new Map(authors.map(author => [String(author.id), author]));
        const commentMap = new Map();
        for (const comment of comments) {
            const key = String(comment.blogId);
            if (!commentMap.has(key)) commentMap.set(key, []);
            commentMap.get(key).push(comment);
        }
        return rows.map(row => ({
            ...row,
            image: contentImageUrl(row, 'blog', 'card'),
            userData: authorMap.get(String(row.userId)) || { id: row.userId, firstName: '', lastName: '' },
            commentData: commentMap.get(String(row.id)) || [],
        }));
    }
    async function collection(data = {}, order) {
        const rows = await models.Blog.findAll({
            attributes: blogCardAttributes,
            where: { statusId: 'S1' },
            include,
            order,
            limit: boundedLimit(data.limit),
            raw: true,
            nest: true,
        });
        return { errCode: 0, data: await hydrateCards(rows) };
    }
    return {
        async getDetailBlogById(id, actor) {
            if (!id) return { errCode: 1, errMessage: 'Missing required parameter !' };
            const editor = ['R1', 'R4'].includes(actor?.roleId);
            const row = await models.Blog.findOne({
                where: editor ? { id } : { id, statusId: 'S1' },
                ...(editor ? {} : { attributes: [...blogCardAttributes, 'contentHTML'] }),
                include,
                raw: true,
                nest: true,
            });
            if (!row) return { errCode: 2, errMessage: 'Bài viết không tồn tại' };
            const author = await models.User.findOne({ where: { id: row.userId }, attributes: ['id', 'firstName', 'lastName'], raw: true });
            if (!editor) await models.Blog.increment('view', { where: { id: row.id } });
            return {
                errCode: 0,
                data: {
                    ...row,
                    view: Number(row.view || 0) + (editor ? 0 : 1),
                    userData: author || { id: row.userId, firstName: '', lastName: '' },
                    image: editor ? (Buffer.isBuffer(row.image) ? row.image.toString('utf8') : row.image || '') : contentImageUrl(row, 'blog', 'detail'),
                },
            };
        },
        async getAllBlog(data = {}) {
            const filter = { attributes: blogCardAttributes, where: { statusId: 'S1' }, include, raw: true, nest: true, order: [['id', 'ASC']] };
            if (Number(data.limit) > 0) {
                filter.limit = boundedLimit(data.limit);
                filter.offset = Math.max(0, Math.floor(Number(data.offset) || 0));
            }
            if (data.subjectId && data.subjectId !== 'ALL') filter.where.subjectId = data.subjectId;
            if (typeof data.keyword === 'string' && data.keyword.trim()) filter.where.title = { [Op.substring]: data.keyword.trim() };
            const result = await models.Blog.findAndCountAll(filter);
            return { errCode: 0, data: await hydrateCards(result.rows), count: result.count };
        },
        getFeatureBlog: (data = {}) => collection(data, [['view', 'DESC'], ['id', 'DESC']]),
        getNewBlog: (data = {}) => collection(data, [['createdAt', 'DESC'], ['id', 'DESC']]),
    };
}
const { getDetailBlogById, getAllBlog, getFeatureBlog, getNewBlog } = createBlogReadService(db);
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
module.exports = {
    createBlogReadService,
    createNewBlog: createNewBlog,
    getDetailBlogById: getDetailBlogById,
    getAllBlog: getAllBlog,
    updateBlog: updateBlog,
    deleteBlog: deleteBlog,
    getFeatureBlog:getFeatureBlog,
    getNewBlog:getNewBlog
}
