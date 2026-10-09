const service = require('../services/messageService');
const { notifyRoom } = require('../socket');
const respond = handler => async (req, res, next) => {
  try {
    const result = await handler(req);
    const { room, ...response } = result;
    res.status(result.errCode === 403 ? 403 : 200).json(response);
  } catch (error) { next(error); }
};
module.exports = {
  createNewRoom: respond(req => service.createNewRoom(req.body, req.user)),
  sendMessage: respond(async req => {
    const result = await service.sendMessage(req.body, req.user);
    if (result.errCode === 0) notifyRoom(req.app.get('io'), result.room);
    return result;
  }),
  loadMessage: respond(req => service.loadMessage(req.query, req.user)),
  listRoomOfUser: respond(req => service.listRoomOfUser(req.query.userId, req.user)),
  listRoomOfAdmin: respond(req => service.listRoomOfAdmin(req.user)),
};
