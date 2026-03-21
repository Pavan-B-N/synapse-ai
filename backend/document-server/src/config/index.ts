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
  serviceName: 'document-server',
  port: registry['document-server'].port,

  mongodb: {
    uri: process.env.MONGODB_URI!,
  },
  s2sToken: {
    secret: process.env.S2S_SECRET!,
  },
  storage: {
    uploadDir: path.resolve(process.cwd(), 'uploads'),
  },
  serviceBus: {
    connectionString: process.env.AZURE_SERVICE_BUS_CONNECTION_STRING!,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  services: {
    aiServer: resolveService('ai-server'),
    logServer: resolveService('log-server'),
  },
};

export default config;
