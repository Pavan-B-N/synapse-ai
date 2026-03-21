/**
 * LoggerService — Single point of change for the logging backend.
 *
 * Every consumer imports this class instead of a concrete logger.
 * To migrate from InternalLogger to Grafana Loki / Datadog / etc.,
 * swap the ILogger implementation in index.ts — nothing else changes.
 */

import { ILogger, LogMeta } from './ILogger';

export class LoggerService {
  constructor(private readonly logger: ILogger) {}

  info(message: string, context?: LogMeta): void { this.logger.info(message, context); }
  warn(message: string, context?: LogMeta): void { this.logger.warn(message, context); }
  error(message: string, context?: LogMeta): void { this.logger.error(message, context); }
  debug(message: string, context?: LogMeta): void { this.logger.debug(message, context); }
  flush(): Promise<void> { return this.logger.flush(); }
}
