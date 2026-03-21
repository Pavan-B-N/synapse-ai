import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config();

const registry = JSON.parse(
  fs.readFileSync(
    process.env.SERVICE_REGISTRY_PATH || path.resolve(process.cwd(), '..', 'service-registry.json'),
    'utf-8'
  )
);
const resolveService = (name: string) => `http://${registry[name].host}:${registry[name].port}`;

const config = {
  serviceName: 'api-gateway-server',
  port: registry['api-gateway'].port,
  jwtToken: { secret: process.env.JWT_SECRET! },
  s2sToken: { secret: process.env.S2S_SECRET! },
  redis: {
    host: process.env.REDIS_HOST!,
    port: Number(process.env.REDIS_PORT!),
    password: process.env.REDIS_PASSWORD!,
    tls: !!(process.env.REDIS_HOST && process.env.REDIS_HOST.includes('.redis.cache.windows.net')),
  },
  services: {
    authServer: resolveService('auth-server'),
    documentServer: resolveService('document-server'),
    aiServer: resolveService('ai-server'),
    coreServer: resolveService('core-server'),
    logServer: resolveService('log-server'),
    adminServer: resolveService('admin-server'),
  },
};

export default config;
