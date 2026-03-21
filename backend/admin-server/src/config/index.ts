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
  serviceName: 'admin-server',
  port: registry['admin-server'].port,
  mongodb: {
    uri: process.env.MONGODB_URI!,
  },
  jwtToken: {
    secret: process.env.JWT_SECRET!,
    expiresIn: '1h',
    refreshExpiresIn: '7d',
  },
  s2sToken: {
    secret: process.env.S2S_SECRET!,
  },
  services: {
    logServer: resolveService('log-server'),
  },
  admin: {
    maxFailedAttempts: 5,
    lockDurationMinutes: 30,
    otpExpiryMinutes: 3,
    passwordMinLength: 12,
  },
};

export default config;
