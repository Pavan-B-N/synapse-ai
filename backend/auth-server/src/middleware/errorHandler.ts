import { Request, Response, NextFunction } from 'express';
import logger from '../Logger';

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  logger.error(`${req.method} ${req.path} ${statusCode} — ${err.message}`, {
    raid: (req as any).raid, userId: (req as any).user?.userId,
    statusCode, path: req.path, method: req.method,
    meta: { code, stack: err.stack, isOperational: err.isOperational },
  });
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: err.isOperational ? err.message : 'An unexpected error occurred',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
};
