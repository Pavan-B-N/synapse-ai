import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import config from './config';
import connectDB from './connections/database';
import { s2sGuard } from './middleware/s2sGuard';
import { serviceAuth } from './middleware/serviceAuth';
import { raidContext } from './middleware/raidContext';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import logger from './Logger';
import aiRoutes from './routes/ai';
import internalRoutes from './routes/internal';
import { createDocumentSubscriber, createAccountDeletionSubscriber } from './utils/subscriber';

const app = express();

// ── Global Middleware ──
app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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
      aiProvider: config.ai.provider,
    },
  });
});

app.get('/ready', async (_req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({
    success: dbReady,
    data: {
      service: config.serviceName,
      checks: {
        database: dbReady ? 'ok' : 'unavailable',
      },
    },
  });
});

// ── S2S Guard → RAID → user context → public AI routes ──
app.use(requestLogger);
app.use('/api/ai', s2sGuard, raidContext, serviceAuth, aiRoutes);

// ── Internal routes (S2S only, used by core-server) ──
app.use('/internal', s2sGuard, raidContext, internalRoutes);

// ── Error handling ──
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ──
const startServer = async () => {
  try {
    await connectDB();

    // Start Service Bus subscribers
    const subscriber = createDocumentSubscriber();
    await subscriber.start();
    const accountSubscriber = createAccountDeletionSubscriber();
    await accountSubscriber.start();

    // Graceful shutdown
    const shutdown = async () => {
      await subscriber.stop();
      await accountSubscriber.stop();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    app.listen(config.port, () => {
    });
  } catch (error: any) {
    process.exit(1);
  }
};

startServer();


export default app;
