const service = require('../services/commentService');
const handle = work => async (req, res, next) => {
  try { res.json(await work(req)); } catch (error) { next(error); }
};
const author = req => ({ ...req.body, userId: req.user.id });
module.exports = {
  createNewReview: handle(req => service.createNewReview(author(req))),
  createNewComment: handle(req => service.createNewComment(author(req))),
  ReplyReview: handle(req => service.ReplyReview(author(req))),
  ReplyComment: handle(req => service.ReplyComment(author(req))),
  getAllReviewByProductId: handle(req => service.getAllReviewByProductId(req.query.id)),
  getAllCommentByBlogId: handle(req => service.getAllCommentByBlogId(req.query.id)),
  deleteReview: handle(req => service.deleteReview(req.body)),
  deleteComment: handle(req => service.deleteComment(req.body)),
};
