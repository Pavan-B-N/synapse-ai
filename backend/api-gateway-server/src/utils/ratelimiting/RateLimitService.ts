import { Request, Response, NextFunction } from 'express';
import { IRateLimitStrategy } from './IRateLimitStrategy';

class RateLimitService {
  private strategy: IRateLimitStrategy;

  constructor(strategy: IRateLimitStrategy) {
    this.strategy = strategy;
  }

  middleware(req: Request, res: Response, next: NextFunction): void {
    const key = (req.headers['x-user-id'] as string) || req.ip || 'unknown';
    this.strategy.consume(key)
      .then((result) => {
        res.set({
          'X-RateLimit-Limit': String(this.strategy.getMaxPoints()),
          'X-RateLimit-Remaining': String(result.remainingPoints),
          'X-RateLimit-Reset': String(Math.ceil(result.msBeforeNext / 1000)),
        });
        next();
      })
      .catch((rejection: any) => {
        res.set({
          'Retry-After': String(Math.ceil(rejection.msBeforeNext / 1000)),
          'X-RateLimit-Limit': String(this.strategy.getMaxPoints()),
          'X-RateLimit-Remaining': '0',
        });
        res.status(429).json({ success: false, error: 'Too many requests, please try again later' });
      });
  }
}

export default RateLimitService;
