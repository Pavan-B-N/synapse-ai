/**
 * Logger Interface — swap implementations without touching consumers.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'verbose';

export interface LogMeta {
  raid?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  statusCode?: number;
  responseTime?: number;
  path?: string;
  method?: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, any>;
}

export interface ILogger {
  info(message: string, context?: LogMeta): void;
  warn(message: string, context?: LogMeta): void;
  error(message: string, context?: LogMeta): void;
  debug(message: string, context?: LogMeta): void;
  flush(): Promise<void>;
}
