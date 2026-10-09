const service = require('../services/receiptService');
const handle = work => async (req, res, next) => {
  try { res.json(await work(req)); } catch (error) { next(error); }
};
module.exports = {
  createNewReceipt: handle(req => service.createNewReceipt({ ...req.body, userId: req.user.id })),
  createNewReceiptDetail: handle(req => service.createNewReceiptDetail(req.body)),
  getDetailReceiptById: handle(req => service.getDetailReceiptById(req.query.id)),
  getAllReceipt: handle(req => service.getAllReceipt(req.query)),
  updateReceipt: handle(req => service.updateReceipt(req.body)),
  deleteReceipt: handle(req => service.deleteReceipt(req.body)),
};
