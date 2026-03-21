import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import config from './config';
import RedisConnectionManager from './utils/redis/RedisConnectionManager';
import SocketManager from './utils/socket/SocketManager';
import RequestContext from './utils/request/RequestContext';
import { jwtAuth } from './middleware/jwtAuth';
import { createRateLimitService } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import logger from './Logger';
import proxyRoutes from './routes/proxy';
import healthRoutes from './routes/health';

const app = express();
const server = http.createServer(app);

// ------- Socket.IO (OOP) -------
const socketManager = new SocketManager(server);
const io = socketManager.getIO();

// Make io available for broadcasting
app.set('io', io);

// ------- Core Middleware -------
app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(RequestContext.middleware);

// Health endpoint (no auth, no rate limit)
app.get('/health', (_req, res) => res.json({
  status: 'healthy',
  service: config.serviceName,
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

/**
 * Readiness probe — verifies all critical dependencies are available.
 * Returns 503 if any dependency is unavailable.
 */
app.get('/ready', async (_req, res) => {
  const redisReady = await RedisConnectionManager.getInstance().isConnected();

  res.status(redisReady ? 200 : 503).json({
    status: redisReady ? 'ready' : 'not_ready',
    checks: {
      redis: redisReady ? 'ok' : 'unavailable',
    },
  });
});

// ------- Routes & middleware registered in start() after Redis is ready -------

// ------- Bootstrap -------
async function start() {
  // 1. Wait for Redis connection (auto-started by getInstance)
  const redisManager = RedisConnectionManager.getInstance();
  await redisManager.isConnected();

  // 2. Attach Redis adapter to Socket.IO (uses same Redis connections)
  await socketManager.attachRedisAdapter();
  socketManager.registerHandlers();

  // 3. Rate limiting + JWT + routes (order-dependent, registered after Redis)
  const rateLimitService = await createRateLimitService();
  app.use(rateLimitService.middleware.bind(rateLimitService));
  app.use(jwtAuth);
  app.use(requestLogger);
  app.use('/gateway', healthRoutes);
  app.use('/', proxyRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  // 4. Graceful shutdown
  const shutdown = async () => {
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(config.port, () => {
    logger.info('Gateway started', { meta: { port: config.port } });
    console.log(`[gateway] Running on port ${config.port}`);
  });
}

start().catch((err) => {
  console.error('[gateway] Failed to start:', err);
  process.exit(1);
});

export { app, io };
