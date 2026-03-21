import { Request, Response, NextFunction } from 'express';

/**
 * RAID (Request Activity ID) middleware.
 * Extracts x-raid header from gateway and attaches to request.
 */
export function raidContext(req: Request, res: Response, next: NextFunction): void {
  const raid = req.headers['x-raid'] as string | undefined;
  (req as any).raid = raid;
  next();
}
