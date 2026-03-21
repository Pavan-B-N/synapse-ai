import Redis from 'ioredis';
import config from '../config';

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  tls: config.redis.port === 6380 ? { servername: config.redis.host } : undefined,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 3000)),
  lazyConnect: true,
});

redis.on('error', () => { /* swallow — connection failure handled at startup */ });

export default redis;
