import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config';
import connectDB from './connections/database';
import { s2sGuard } from './middleware/s2sGuard';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import logRoutes from './routes/logs';

const app = express();

// ── Global Middleware ──
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));

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

// ── S2S Guard — only internal services can write logs ──
app.use('/api/logs', s2sGuard);
app.use('/api/logs', logRoutes);

// ── Error handling ──
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ──
const startServer = async () => {
  try {
    await connectDB();

    app.listen(config.port, () => {
    });
  } catch (error: any) {
    process.exit(1);
  }
};

startServer();

process.on('uncaughtException', (err) => {
  process.exit(1);
});

export default app;
