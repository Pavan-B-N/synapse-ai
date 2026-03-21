import Redis, { RedisOptions } from 'ioredis';
import config from '../../config';

class RedisConnectionManager {
    private static instance: RedisConnectionManager;

    // Regular commands — rate limiting, caching, session storage
    private primaryClient: Redis | null = null;
    // Publishes Socket.IO events to other gateway instances via Redis Pub/Sub
    private publisherClient: Redis | null = null;
    // Listens for Socket.IO events — locked in subscriber mode, cannot run other commands
    private subscriberClient: Redis | null = null;

    private connectPromise: Promise<boolean> | null = null;

    private constructor() { }

    static getInstance(): RedisConnectionManager {
        if (!RedisConnectionManager.instance) {
            RedisConnectionManager.instance = new RedisConnectionManager();
            RedisConnectionManager.instance.connectPromise = RedisConnectionManager.instance.connect();

            process.once('SIGTERM', () => RedisConnectionManager.instance?.disconnect());
            process.once('SIGINT', () => RedisConnectionManager.instance?.disconnect());
        }
        return RedisConnectionManager.instance;
    }

    async isConnected(): Promise<boolean> {
        if (!this.isConfigured()) return false;
        if (this.connectPromise) await this.connectPromise;
        return this.primaryClient?.status === 'ready' || false;
    }

    private isConfigured(): boolean {
        return !!(config.redis.host && config.redis.password);
    }

    private buildOptions(): RedisOptions {
        return {
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password,
            tls: config.redis.tls ? { servername: config.redis.host } : undefined,
            connectTimeout: 10000,
            retryStrategy: (times: number) => Math.min(times * 200, 5000),
            lazyConnect: true,
        };
    }

    getClient(): Redis | null {
        if (!this.isConfigured()) return null;
        if (!this.primaryClient) {
            this.primaryClient = new Redis(this.buildOptions());
        }
        return this.primaryClient;
    }

    getPublisherClient(): Redis | null {
        if (!this.isConfigured()) return null;
        if (!this.publisherClient) {
            this.publisherClient = new Redis(this.buildOptions());
        }
        return this.publisherClient;
    }

    getSubscriberClient(): Redis | null {
        if (!this.isConfigured()) return null;
        if (!this.subscriberClient) {
            this.subscriberClient = new Redis(this.buildOptions());
        }
        return this.subscriberClient;
    }

    private async connect(): Promise<boolean> {
        if (!this.isConfigured()) {
            console.log('[gateway] Redis: not configured, skipping');
            return false;
        }

        try {
            const clients = [
                this.getClient(),
                this.getPublisherClient(),
                this.getSubscriberClient(),
            ].filter(Boolean) as Redis[];

            await Promise.all(clients.map((c) => c.connect()));
            console.log('[gateway] Redis: all clients connected');
            return true;
        } catch (err: any) {
            console.warn('[gateway] Redis: connection failed:', err.message);
            return false;
        }
    }

    async disconnect(): Promise<void> {
        const clients = [this.primaryClient, this.publisherClient, this.subscriberClient];
        await Promise.all(clients.filter(Boolean).map((c) => c!.quit().catch(() => { })));
        this.primaryClient = null;
        this.publisherClient = null;
        this.subscriberClient = null;
    }
}

export default RedisConnectionManager;
