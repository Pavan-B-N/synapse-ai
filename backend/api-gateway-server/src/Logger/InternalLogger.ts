/**
 * InternalLogger — Buffers log entries and flushes them to the centralized log-server via HTTP.
 *
 * Replace this class with GrafanaLokiLogger, DatadogLogger, etc. to migrate
 * without touching any consumer code.
 */

import { ILogger, LogLevel, LogMeta } from './ILogger';

interface QueuedEntry {
  service: string;
  level: LogLevel;
  message: string;
  timestamp: string;
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

export class InternalLogger implements ILogger {
  private buffer: QueuedEntry[] = [];
  private timer: NodeJS.Timeout;
  private flushing = false;

  constructor(
    private readonly serviceName: string,
    private readonly logServerUrl: string,
    private readonly s2sSecret: string,
    private readonly maxBufferSize: number = 20,
    private readonly flushIntervalMs: number = 5000,
  ) {
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
    this.timer.unref();
  }

  info(message: string, context?: LogMeta): void { this.enqueue('info', message, context); }
  warn(message: string, context?: LogMeta): void { this.enqueue('warn', message, context); }
  error(message: string, context?: LogMeta): void { this.enqueue('error', message, context); }
  debug(message: string, context?: LogMeta): void { this.enqueue('debug', message, context); }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    const batch = this.buffer.splice(0);
    try {
      await fetch(`${this.logServerUrl}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': this.s2sSecret },
        body: JSON.stringify(batch),
      });
    } catch {
      // Fire-and-forget — never crash the host service because of logging
      console.error(`[${this.serviceName}] log flush failed (${batch.length} entries lost)`);
    } finally {
      this.flushing = false;
    }
  }

  private enqueue(level: LogLevel, message: string, context?: LogMeta): void {
    const entry: QueuedEntry = { service: this.serviceName, level, message, timestamp: new Date().toISOString() };
    if (context) {
      if (context.raid) entry.raid = context.raid;
      if (context.traceId) entry.traceId = context.traceId;
      if (context.spanId) entry.spanId = context.spanId;
      if (context.userId) entry.userId = context.userId;
      if (context.statusCode !== undefined) entry.statusCode = context.statusCode;
      if (context.responseTime !== undefined) entry.responseTime = context.responseTime;
      if (context.path) entry.path = context.path;
      if (context.method) entry.method = context.method;
      if (context.ip) entry.ip = context.ip;
      if (context.userAgent) entry.userAgent = context.userAgent;
      if (context.meta) entry.meta = context.meta;
    }
    this.buffer.push(entry);
    if (this.buffer.length >= this.maxBufferSize) this.flush();
  }
}
