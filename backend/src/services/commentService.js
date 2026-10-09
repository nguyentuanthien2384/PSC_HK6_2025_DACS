const db = require('../models');
const { Op } = require('sequelize');
const { positiveInteger, fail, resultOf } = require('../utils/commerce');
const contentOf = data => {
  const content = typeof data.content === 'string' ? data.content.trim() : '';
  if (!content || content.length > 10000 || !positiveInteger(data.userId)) fail('Nội dung hoặc tài khoản không hợp lệ.');
  return content;
};
const createEntry = async (data, type, reply = false) => {
  const content = contentOf(data);
  const key = type === 'product' ? 'productId' : 'blogId';
  if (!positiveInteger(data[key])) fail('Nội dung được bình luận không hợp lệ.');
  const entity = await db[type === 'product' ? 'Product' : 'Blog'].findByPk(data[key], { attributes: ['id'], raw: true });
  if (!entity) fail('Nội dung đã bị xóa.', 2);
  const values = { [key]: data[key], content, userId: data.userId };
  if (reply) {
    if (!positiveInteger(data.parentId)) fail('Bình luận gốc không hợp lệ.');
    const parent = await db.Comment.findOne({ where: { id: data.parentId, [key]: data[key], parentId: { [Op.is]: null } }, raw: true });
    if (!parent) fail('Không tìm thấy bình luận gốc.', 2);
    values.parentId = data.parentId;
  } else {
    if (type === 'product' && (!positiveInteger(data.star) || Number(data.star) > 5)) fail('Đánh giá phải từ 1 đến 5 sao.');
    if (type === 'product') values.star = Number(data.star);
    if (data.image) values.image = data.image;
  }
  await db.Comment.create(values);
  return { errCode: 0, errMessage: 'ok' };
};
const loadEntries = async (id, key) => {
  if (!positiveInteger(id)) fail('Mã nội dung không hợp lệ.');
  const rows = await db.Comment.findAll({ where: { [key]: id, parentId: { [Op.is]: null } }, order: [['createdAt', 'DESC']], raw: true });
  const userCache = new Map();
  const attach = async comment => {
    comment.image = comment.image ? Buffer.from(comment.image).toString('utf8') : '';
    if (!userCache.has(comment.userId)) {
      const user = await db.User.findByPk(comment.userId, { attributes: ['id', 'firstName', 'lastName', 'image'], raw: true });
      if (user?.image) user.image = Buffer.from(user.image).toString('utf8');
      userCache.set(comment.userId, user || { firstName: 'Tài khoản', lastName: 'đã xóa', image: '' });
    }
    comment.user = userCache.get(comment.userId);
  };
  for (const row of rows) {
    await attach(row);
    row.childComment = await db.Comment.findAll({ where: { parentId: row.id }, order: [['createdAt', 'ASC']], raw: true });
    for (const child of row.childComment) await attach(child);
  }
  return { errCode: 0, data: rows };
};
const deleteEntry = async data => {
  if (!positiveInteger(data.id)) fail('Mã bình luận không hợp lệ.');
  const deleted = await db.Comment.destroy({ where: { [Op.or]: [{ id: data.id }, { parentId: data.id }] } });
  if (!deleted) fail('Không tìm thấy bình luận.', 2);
  return { errCode: 0, errMessage: 'ok' };
};
module.exports = {
  createNewReview: data => resultOf(() => createEntry(data, 'product')),
  createNewComment: data => resultOf(() => createEntry(data, 'blog')),
  ReplyReview: data => resultOf(() => createEntry(data, 'product', true)),
  ReplyComment: data => resultOf(() => createEntry(data, 'blog', true)),
  getAllReviewByProductId: id => resultOf(() => loadEntries(id, 'productId')),
  getAllCommentByBlogId: id => resultOf(() => loadEntries(id, 'blogId')),
  deleteReview: data => resultOf(() => deleteEntry(data)),
  deleteComment: data => resultOf(() => deleteEntry(data)),
};
