import { RateLimiterAbstract, RateLimiterRedis } from 'rate-limiter-flexible';
import { IRateLimitStrategy } from './IRateLimitStrategy';

class TokenBucketRateLimitStrategy implements IRateLimitStrategy {
  private limiter: RateLimiterAbstract;
  private maxPoints: number;

  constructor(redisClient: any, maxPoints: number) {
    this.maxPoints = maxPoints;
    this.limiter = new RateLimiterRedis({
      storeClient: redisClient,
      points: maxPoints,
      duration: 60,
      keyPrefix: 'rl:gateway',
    });
  }

  async consume(key: string): Promise<{ remainingPoints: number; msBeforeNext: number }> {
    const result = await this.limiter.consume(key);
    return {
      remainingPoints: result.remainingPoints,
      msBeforeNext: result.msBeforeNext,
    };
  }

  getMaxPoints(): number {
    return this.maxPoints;
  }
}

export default TokenBucketRateLimitStrategy;
