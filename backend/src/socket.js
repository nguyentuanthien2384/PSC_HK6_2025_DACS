const middleware = require('./middlewares/jwtVerify');
const service = require('./services/messageService');

function socketIdentity(socket) {
  const token = socket.handshake.auth?.token;
  const req = { headers: { authorization: token ? `Bearer ${token}` : socket.handshake.headers.authorization } };
  return new Promise((resolve, reject) => {
    const res = { status() { return this; }, json(data) { const error = new Error(data.errMessage || 'Vui lòng đăng nhập'); error.data = data; reject(error); } };
    middleware.verifyTokenUser(req, res, error => error ? reject(error) : resolve(req.user));
  });
}
function notifyRoom(io, room) {
  if (io && room) io.to(`user:${room.userOne}`).to(`user:${room.userTwo}`).to('support:admins')
    .emit('sendDataServer', { roomId: room.id });
}
function configureSocket(io) {
  io.use(async (socket, next) => {
    try { socket.data.user = await socketIdentity(socket); next(); }
    catch (error) { next(error); }
  });
  io.on('connection', socket => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    if (['R1', 'R4'].includes(user.roleId)) socket.join('support:admins');
    socket.emit('getId', socket.id);
    socket.on('sendDataClient', async (data, acknowledge) => {
      let result;
      try {
        const currentUser = await socketIdentity(socket);
        result = await service.sendMessage(data || {}, currentUser);
        if (result.errCode === 0) notifyRoom(io, result.room);
      } catch (error) { result = { errCode: -1, errMessage: 'Không thể gửi tin nhắn. Vui lòng đăng nhập lại hoặc thử lại.' }; }
      const { room, ...response } = result;
      if (typeof acknowledge === 'function') acknowledge(response);
      else if (result.errCode !== 0) socket.emit('messageError', response);
    });
    socket.on('loadRoomClient', () => socket.emit('loadRoomServer'));
  });
}
module.exports = { configureSocket, notifyRoom, socketIdentity };
