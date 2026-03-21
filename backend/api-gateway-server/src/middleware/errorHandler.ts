import { Request, Response, NextFunction } from 'express';
import logger from '../Logger';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const status = err.statusCode || err.status || 500;
  logger.error(`${req.method} ${req.originalUrl} ${status} — ${err.message}`, {
    raid: (req as any).raid || req.headers['x-raid'] as string,
    userId: req.headers['x-user-id'] as string,
    statusCode: status, path: req.originalUrl, method: req.method,
    meta: { stack: err.stack },
  });
  res.status(status).json({ success: false, error: status < 500 ? err.message : 'Internal gateway error' });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.originalUrl} not found` });
}

