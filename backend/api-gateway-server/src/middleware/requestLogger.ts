/**
 * Request Logger Middleware — auto-logs every HTTP request/response with RAID tracing context.
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../Logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    if (req.path === '/health' || req.path === '/ready') return;

    const duration = Date.now() - start;
    const userId = (req as any).user?.id || (req as any).user?.userId || req.headers['x-user-id'] as string;
    const raid = (req as any).raid || req.headers['x-raid'] as string;

    const context = {
      raid,
      userId,
      statusCode: res.statusCode,
      responseTime: duration,
      path: req.originalUrl || req.path,
      method: req.method,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.get('user-agent'),
    };

    if (res.statusCode >= 500) {
      logger.error(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, context);
    } else if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, context);
    } else {
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, context);
    }
  });

  next();
};
