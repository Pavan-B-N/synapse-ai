import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import config from './config';
import connectDB from './connections/database';
import redis from './connections/redis';
import { s2sGuard } from './middleware/s2sGuard';
import { serviceAuth } from './middleware/serviceAuth';
import { raidContext } from './middleware/raidContext';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import logger from './Logger';
import documentRoutes from './routes/documents';
import { startChangeStream } from './utils/changestream/ChangeStreamService';
import { createAccountDeletionSubscriber } from './utils/subscriber';

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

// ── S2S Guard + RAID + User Context + Routes ──
app.use(requestLogger);
app.use('/api/documents', s2sGuard, raidContext, serviceAuth, documentRoutes);

// ── Error handling ──
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ──
const startServer = async () => {
  try {
    await connectDB();
    try { await redis.connect(); } catch {
      console.warn('[document-server] Redis unavailable — bloom filter dedup disabled');
    }

    const uploadDir = path.resolve(config.storage.uploadDir);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    // Start CDC change stream for real-time SSE
    startChangeStream();

    // Start Service Bus subscriber for account deletion
    const accountSubscriber = createAccountDeletionSubscriber();
    await accountSubscriber.start();

    app.listen(config.port, () => {
    });
  } catch (error: any) {
    process.exit(1);
  }
};

startServer();


export default app;
