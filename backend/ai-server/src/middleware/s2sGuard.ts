import { Request, Response, NextFunction } from 'express';
import config from '../config';

export const s2sGuard = (req: Request, res: Response, next: NextFunction) => {
  const internalKey = req.headers['x-internal-key'] as string;
  if (!config.s2sToken.secret) return next();
  if (!internalKey || internalKey !== config.s2sToken.secret) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid service-to-service credentials' } });
  }
  next();
};
