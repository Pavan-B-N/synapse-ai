import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config';
import connectDB from './connections/database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import adminRoutes from './routes/admin';

const app = express();

// ── Global Middleware ──
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

// ── Health & Readiness ──
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      service: config.serviceName,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
    },
  });
});

app.get('/ready', async (_req, res) => {
  const mongoose = await import('mongoose');
  const dbReady = mongoose.default.connection.readyState === 1;
  const status = dbReady ? 200 : 503;
  res.status(status).json({
    success: dbReady,
    data: {
      service: config.serviceName,
      checks: { database: dbReady ? 'ok' : 'unavailable' },
    },
  });
});

// ── Routes ──
app.use('/api/admin', adminRoutes);

// ── Error handling ──
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ──
const startServer = async () => {
  try {
    await connectDB();
    app.listen(config.port, () => {
      console.log(`[admin-server] Running on port ${config.port}`);
    });
  } catch (error: any) {
    console.error('[admin-server] Failed to start:', error.message);
    process.exit(1);
  }
};

startServer();

process.on('uncaughtException', (err) => {
  console.error('[admin-server] Uncaught exception:', err);
  process.exit(1);
});

export default app;
