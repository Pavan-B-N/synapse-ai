import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import config from './config';
import connectDB from './connections/database';
import { s2sGuard } from './middleware/s2sGuard';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { serviceAuth } from './middleware/serviceAuth';
import { raidContext } from './middleware/raidContext';
import { requestLogger } from './middleware/requestLogger';
import logger from './Logger';
import quizRoutes from './routes/quiz';
import groupRoutes from './routes/groups';
import dashboardRoutes from './routes/dashboard';
import notificationRoutes from './routes/notifications';
import channelRoutes from './routes/channels';
import { createNotificationSubscriber, createAccountDeletionSubscriber } from './utils/subscriber';
import { broadcaster } from './utils/broadcast';

const app = express();

// ------- Middleware -------
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Health & readiness (public)
app.get('/health', (_req, res) => res.json({
  status: 'healthy',
  service: config.serviceName,
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

app.get('/ready', async (_req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;
  const ready = mongoReady;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    mongo: mongoReady,
  });
});

// S2S guard — only gateway can reach this service
app.use(s2sGuard);
app.use(raidContext);
app.use(serviceAuth);
app.use(requestLogger);

// Serve channel uploads (static files behind S2S guard)
const channelUploadDir = path.resolve(process.cwd(), 'channel-uploads');
if (!fs.existsSync(channelUploadDir)) fs.mkdirSync(channelUploadDir, { recursive: true });
app.use('/channel-uploads', express.static(channelUploadDir));

// ------- Routes -------
app.use('/api/quiz', quizRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/channels', channelRoutes);

// ------- Error handling -------
app.use(notFoundHandler);
app.use(errorHandler);

// ------- Bootstrap -------
async function start() {
  await connectDB();

  // Connect broadcaster to gateway Socket.IO
  broadcaster.connect();

  // Start Service Bus subscribers
  const notifSubscriber = createNotificationSubscriber();
  await notifSubscriber.start();
  const accountSubscriber = createAccountDeletionSubscriber();
  await accountSubscriber.start();

  // Graceful shutdown
  const shutdown = async () => {
    broadcaster.disconnect();
    await notifSubscriber.stop();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  app.listen(config.port, () => {
  });
}

start().catch((err) => {
  process.exit(1);
});

export default app;
