import db from '../models';
import { Op } from 'sequelize';

const admin = user => user && ['R1', 'R4'].includes(user.roleId);
const missing = () => ({ errCode: 1, errMessage: 'Thiếu thông tin bắt buộc.' });
const denied = () => ({ errCode: 403, errMessage: 'Bạn không có quyền truy cập cuộc trò chuyện này.' });
const safeUser = async id => {
  const user = await db.User.findByPk(id, { attributes: ['id', 'firstName', 'lastName', 'image'], raw: true });
  if (user?.image) user.image = Buffer.from(user.image).toString('utf8');
  return user;
};
const getRoomForUser = async (roomId, user) => {
  if (!user || !roomId) return null;
  const room = await db.RoomMessage.findByPk(roomId, { raw: true });
  if (!room || (!admin(user) && ![room.userOne, room.userTwo].some(id => String(id) === String(user.id)))) return null;
  return room;
};

const createNewRoom = async (data, user) => {
  if (!user) return denied();
  const userId = admin(user) && data.userId1 ? data.userId1 : user.id;
  const customer = await db.User.findByPk(userId, { attributes: ['id'], raw: true });
  if (!customer) return missing();
  let room = await db.RoomMessage.findOne({ where: { userOne: userId }, raw: true });
  if (room) return { errCode: 0, data: room, errMessage: 'ok' };
  const support = await db.User.findOne({ where: { roleId: { [Op.in]: ['R1', 'R4'] }, statusId: 'S1' }, order: [['id', 'ASC']], attributes: ['id'], raw: true });
  if (!support) return { errCode: 2, errMessage: 'Chưa có nhân viên hỗ trợ đang hoạt động.' };
  room = await db.RoomMessage.create({ userOne: userId, userTwo: support.id });
  return { errCode: 0, data: room, errMessage: 'ok' };
};

const sendMessage = async (data, user) => {
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!data.roomId || !text || text.length > 5000) return missing();
  const room = await getRoomForUser(data.roomId, user);
  if (!room) return denied();
  const message = await db.Message.create({ text, userId: user.id, roomId: room.id, unRead: true });
  return { errCode: 0, errMessage: 'ok', data: message, room };
};

const loadMessage = async (data, user) => {
  const room = await getRoomForUser(data.roomId, user);
  if (!room) return denied();
  await db.Message.update({ unRead: false }, { where: { roomId: room.id, userId: { [Op.ne]: user.id } } });
  const messages = await db.Message.findAll({ where: { roomId: room.id }, order: [['createdAt', 'ASC'], ['id', 'ASC']], raw: true });
  const users = new Map();
  for (const message of messages) {
    if (!users.has(message.userId)) users.set(message.userId, await safeUser(message.userId));
    message.userData = users.get(message.userId);
  }
  return { errCode: 0, data: messages };
};
const decorateRooms = async rooms => {
  for (const room of rooms) {
    room.messageData = await db.Message.findAll({ where: { roomId: room.id }, order: [['createdAt', 'ASC']], raw: true });
    room.userOneData = await safeUser(room.userOne);
    room.userTwoData = await safeUser(room.userTwo);
  }
  return { errCode: 0, data: rooms };
};
const listRoomOfUser = async (userId, user) => {
  if (!user) return denied();
  const id = admin(user) && userId ? userId : user.id;
  return decorateRooms(await db.RoomMessage.findAll({ where: { [Op.or]: [{ userOne: id }, { userTwo: id }] }, order: [['updatedAt', 'DESC']], raw: true }));
};
const listRoomOfAdmin = async user => {
  if (!admin(user)) return denied();
  return decorateRooms(await db.RoomMessage.findAll({ order: [['updatedAt', 'DESC']], raw: true }));
};
module.exports = { createNewRoom, sendMessage, loadMessage, listRoomOfUser, listRoomOfAdmin, getRoomForUser };
