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

const config = {
  serviceName: 'log-server',
  port: registry['log-server'].port,
  mongodb: {
    uri: process.env.MONGODB_URI!,
  },
  s2sToken: {
    secret: process.env.S2S_SECRET!,
  },
  logRetentionDays: 30,
  maxBatchSize: 100,
};

export default config;
