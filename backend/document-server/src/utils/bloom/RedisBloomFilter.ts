import crypto from 'crypto';
import Redis from 'ioredis';

/**
 * RedisBloomFilter — Redis-backed probabilistic duplicate detection.
 * Uses SETBIT/GETBIT on a Redis key, so it survives restarts and
 * is shared across multiple server instances. No RedisBloom module required.
 */
export class RedisBloomFilter {
  private redis: Redis;
  private key: string;
  private size: number;
  private hashCount: number;

  constructor(redis: Redis, key: string, size: number = 50000, hashCount: number = 7) {
    this.redis = redis;
    this.key = key;
    this.size = size;
    this.hashCount = hashCount;
  }

  private _hash(item: string, seed: number): number {
    const hash = crypto.createHash('md5').update(`${seed}:${item}`).digest();
    return hash.readUInt32BE(0) % this.size;
  }

  async add(item: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (let i = 0; i < this.hashCount; i++) {
      pipeline.setbit(this.key, this._hash(item, i), 1);
    }
    await pipeline.exec();
  }

  async mightContain(item: string): Promise<boolean> {
    const pipeline = this.redis.pipeline();
    for (let i = 0; i < this.hashCount; i++) {
      pipeline.getbit(this.key, this._hash(item, i));
    }
    const results = await pipeline.exec();
    return results!.every(([err, val]) => !err && val === 1);
  }
}
