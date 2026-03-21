/**
 * LOG SERVER — Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';
import config from '../config';
import logHandler from '../utils/LogHandler';

const router = Router();

// In-memory SSE clients
const sseClients: Set<Response> = new Set();

/**
 * POST /api/logs — Ingest log entries (single or batch, idempotent via traceId dedup)
 *
 * @body {object|object[]} - Single log entry or array of entries
 *   Each entry: { service, level, message, meta?, raid?, traceId?, spanId?, userId?, statusCode?, responseTime?, path?, method?, ip?, userAgent? }
 *
 * @response 201 { success, data: { ingested: number } }
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = Array.isArray(req.body) ? req.body : [req.body];
    if (entries.length === 0) throw new ValidationError('At least one log entry is required');
    if (entries.length > config.maxBatchSize) throw new ValidationError(`Batch size exceeds maximum of ${config.maxBatchSize}`);

    const saved = await logHandler.ingest(entries);

    for (const doc of saved) {
      const event = `data: ${JSON.stringify(doc)}\n\n`;
      for (const client of sseClients) client.write(event);
    }

    res.status(201).json({ success: true, data: { ingested: saved.length } });
  } catch (error) { next(error); }
});

/**
 * GET /api/logs — Query logs with filters
 *
 * @query {string} [service]  - Filter by service name
 * @query {string} [level]    - Filter by log level (info, warn, error)
 * @query {string} [traceId]  - Filter by trace ID
 * @query {string} [raid]     - Filter by request activity ID
 * @query {string} [userId]   - Filter by user ID
 * @query {string} [from]     - Start date (ISO string)
 * @query {string} [to]       - End date (ISO string)
 * @query {string} [search]   - Search text in message (regex, case-insensitive)
 * @query {number} [page=1]   - Page number
 * @query {number} [limit=50] - Results per page (max 200)
 *
 * @response 200 { success, data: { logs, pagination: { page, limit, total, pages } } }
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await logHandler.query(req.query as Record<string, string>);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * GET /api/logs/raid/:raid — Full API traversal trace for a specific RAID
 *
 * @param {string} raid - The request activity ID to trace
 *
 * @response 200 { success, data: { raid, summary: { totalLogs, services, serviceCount, totalDurationMs, hasErrors, startedAt, endedAt }, timeline, byService } }
 */
router.get('/raid/:raid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raid = req.params.raid as string;
    if (!raid) throw new ValidationError('RAID parameter is required');
    const result = await logHandler.traceByRaid(raid);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * GET /api/logs/stream — SSE real-time log stream
 *
 * @response SSE text/event-stream — each log entry as a JSON data event, heartbeat every 30s
 */
router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 30000);
  sseClients.add(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

/**
 * GET /api/logs/stats — Log analytics and statistics
 *
 * @query {number} [hours=24] - Time window in hours
 *
 * @response 200 { success, data: { period, totalLogs, errorCount, errorRate, byService, byLevel, sseClients } }
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const stats = await logHandler.getStats(hours);
    res.json({ success: true, data: { ...stats, sseClients: sseClients.size } });
  } catch (error) { next(error); }
});

/**
 * DELETE /api/logs — Purge old logs
 *
 * @query {number} [olderThanDays=30] - Delete logs older than this many days
 *
 * @response 200 { success, data: { deleted: number } }
 */
router.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = parseInt(req.query.olderThanDays as string) || 30;
    const result = await logHandler.purge(days);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

export default router;
