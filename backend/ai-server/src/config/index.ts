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
  serviceName: 'ai-server',
  port: registry['ai-server'].port,
  mongodb: {
    uri: process.env.MONGODB_URI!,
  },
  s2sToken: {
    secret: process.env.S2S_SECRET!,
  },
  serviceBus: {
    connectionString: process.env.AZURE_SERVICE_BUS_CONNECTION_STRING!,
  },
  azure: {
    openai: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
      embeddingDeployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT!,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION!,
    },
    search: {
      endpoint: process.env.AZURE_SEARCH_ENDPOINT!,
      apiKey: process.env.AZURE_SEARCH_API_KEY!,
      indexName: process.env.AZURE_SEARCH_INDEX_NAME!,
    },
  },
  ai: {
    provider: 'azure',
  },
  services: {
    documentServer: resolveService('document-server'),
    logServer: resolveService('log-server'),
  },
};

export default config;
