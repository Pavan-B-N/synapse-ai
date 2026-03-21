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
  serviceName: 'auth-server',
  port: registry['auth-server'].port,
  mongodb: {
    uri: process.env.MONGODB_URI!,
  },
  jwtToken: {
    secret: process.env.JWT_SECRET!,
    expiresIn: '7d',
    refreshExpiresIn: '30d',
  },
  s2sToken: {
    secret: process.env.S2S_SECRET!,
  },
  serviceBus: {
    connectionString: process.env.AZURE_SERVICE_BUS_CONNECTION_STRING!,
  },
  services: {
    logServer: resolveService('log-server'),
  },
};

export default config;
