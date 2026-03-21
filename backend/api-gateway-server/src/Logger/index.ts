/**
 * Logger composition root — wire the concrete implementation here.
 *
 * To migrate to Grafana Loki, DataDog, etc.:
 *   1. Create a new class implementing ILogger (e.g. GrafanaLokiLogger)
 *   2. Swap InternalLogger below — no other file changes.
 */

import config from '../config';
import { InternalLogger } from './InternalLogger';
import { LoggerService } from './LoggerService';

const internalLogger = new InternalLogger(
  config.serviceName,
  config.services.logServer,
  config.s2sToken.secret,
);

const logger = new LoggerService(internalLogger);

export default logger;
export type { ILogger, LogMeta } from './ILogger';
export { LoggerService } from './LoggerService';
