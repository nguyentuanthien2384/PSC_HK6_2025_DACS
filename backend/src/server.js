require('./config/env');
const http = require('http');
const { createApp, allowedOrigins } = require('./app');
const connectDB = require('./config/connectDB');
const db = require('./models');
const { configureSocket } = require('./socket');

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET phải có ít nhất 32 ký tự. Cập nhật backend/.env.');
  }
  await connectDB();
  const app = createApp();
  const server = http.createServer(app);
  const io = require('socket.io')(server, { cors: { origin: allowedOrigins(), credentials: true } });
  configureSocket(io);
  app.set('io', io);
  const port = Number(process.env.PORT) || 6969;
  server.listen(port, () => console.log(`Backend listening on port ${port}`));
  const shutdown = () => {
    io.close();
    server.close(async () => { await db.sequelize.close(); process.exit(0); });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}
if (require.main === module) start().catch(async error => {
  console.error('Backend startup failed:', error.message);
  await db.sequelize.close().catch(() => {});
  process.exitCode = 1;
});
module.exports = { start };
