import RedisConnectionManager from '../utils/redis/RedisConnectionManager';
import TokenBucketRateLimitStrategy from '../utils/ratelimiting/TokenBucketRateLimitStrategy';
import RateLimitService from '../utils/ratelimiting/RateLimitService';

const REQUESTS_PER_MINUTE = 200;

export async function createRateLimitService(): Promise<RateLimitService> {
  const redis = RedisConnectionManager.getInstance();
  const client = redis.getClient();
  if (!client || !await redis.isConnected()) {
    throw new Error('Redis is required for rate limiting');
  }
  const strategy = new TokenBucketRateLimitStrategy(client, REQUESTS_PER_MINUTE);
  console.log('[gateway] Rate limiter: Redis-backed token bucket');
  return new RateLimitService(strategy);
}
