/**
 * Logger composition root — wire the concrete implementation here.
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
