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
import authRoutes from './routes/auth';

const app = express();

// ── Global Middleware ──
app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
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
  const dbReady = mongoose.connection.readyState === 1;
  const allReady = dbReady;
  res.status(allReady ? 200 : 503).json({
    success: allReady,
    data: {
      service: config.serviceName,
      checks: {
        database: dbReady ? 'ok' : 'unavailable',
      },
    },
  });
});

// ── S2S Guard + RAID + User Context ──
app.use(requestLogger);
app.use('/api/auth', s2sGuard, raidContext, serviceAuth, authRoutes);

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


export default app;
