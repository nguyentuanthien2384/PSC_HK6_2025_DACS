require('./config/env');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const initWebRoutes = require('./route/web');
const db = require('./models');

function allowedOrigins() {
  return (process.env.CORS_ORIGINS || process.env.URL_REACT || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',').map(value => value.trim().replace(/\/$/, '')).filter(Boolean);
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.use(cors({
    origin(origin, done) {
      if (!origin || allowedOrigins().includes(origin)) return done(null, true);
      const error = new Error('Origin không được phép truy cập API.');
      error.status = 403;
      done(error);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }));
  app.use(compression());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ limit: '15mb', extended: true }));
  app.get('/api/health', async (req, res) => {
    try {
      await db.sequelize.authenticate();
      res.json({ errCode: 0, status: 'ok', database: 'connected' });
    } catch (error) {
      res.status(503).json({ errCode: 503, status: 'unavailable', database: 'disconnected', errMessage: 'Không thể kết nối MySQL.' });
    }
  });
  initWebRoutes(app);
  app.use((req, res) => res.status(404).json({ errCode: 404, errMessage: 'API không tồn tại.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    if (status >= 500) console.error('Request failed:', error.name);
    res.status(status).json({ errCode: status, errMessage: status === 500 ? 'Lỗi máy chủ. Vui lòng thử lại.' : error.message });
  });
  return app;
}
module.exports = { createApp, allowedOrigins };
