import LogEntry from '../models/LogEntry';

class LogHandler {
  async ingest(entries: any[]) {
    const docs = entries.map((entry: any) => ({
      service: entry.service || 'unknown',
      level: entry.level || 'info',
      message: entry.message || '',
      timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
      meta: entry.meta || {},
      raid: entry.raid,
      traceId: entry.traceId,
      spanId: entry.spanId,
      userId: entry.userId,
      statusCode: entry.statusCode,
      responseTime: entry.responseTime,
      path: entry.path,
      method: entry.method,
      ip: entry.ip,
      userAgent: entry.userAgent,
    }));

    return LogEntry.insertMany(docs, { ordered: false });
  }

  async query(filters: Record<string, string>) {
    const { service, level, traceId, raid, userId, from, to, page = '1', limit = '50', search } = filters;

    const filter: any = {};
    if (service) filter.service = service;
    if (level) filter.level = level;
    if (traceId) filter.traceId = traceId;
    if (raid) filter.raid = raid;
    if (userId) filter.userId = userId;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    if (search) filter.message = { $regex: search, $options: 'i' };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    const [logs, total] = await Promise.all([
      LogEntry.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
      LogEntry.countDocuments(filter),
    ]);

    return { logs, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } };
  }

  async traceByRaid(raid: string) {
    const logs = await LogEntry.find({ raid }).sort({ timestamp: 1 }).lean();

    const serviceTimeline: Record<string, any[]> = {};
    for (const log of logs) {
      const svc = log.service || 'unknown';
      if (!serviceTimeline[svc]) serviceTimeline[svc] = [];
      serviceTimeline[svc].push(log);
    }

    const services = Object.keys(serviceTimeline);
    const firstLog = logs[0];
    const lastLog = logs[logs.length - 1];
    const totalDuration = firstLog && lastLog
      ? new Date(lastLog.timestamp).getTime() - new Date(firstLog.timestamp).getTime()
      : 0;

    return {
      raid,
      summary: {
        totalLogs: logs.length,
        services,
        serviceCount: services.length,
        totalDurationMs: totalDuration,
        hasErrors: logs.some((l: any) => l.level === 'error'),
        startedAt: firstLog?.timestamp,
        endedAt: lastLog?.timestamp,
      },
      timeline: logs,
      byService: serviceTimeline,
    };
  }

  async getStats(hours: number) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [byService, byLevel, totalCount, errorCount] = await Promise.all([
      LogEntry.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$service', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      LogEntry.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$level', count: { $sum: 1 } } },
      ]),
      LogEntry.countDocuments({ createdAt: { $gte: since } }),
      LogEntry.countDocuments({ createdAt: { $gte: since }, level: 'error' }),
    ]);

    return {
      period: `${hours}h`,
      totalLogs: totalCount,
      errorCount,
      errorRate: totalCount > 0 ? ((errorCount / totalCount) * 100).toFixed(2) + '%' : '0%',
      byService: byService.reduce((acc: any, s: any) => ({ ...acc, [s._id]: s.count }), {}),
      byLevel: byLevel.reduce((acc: any, l: any) => ({ ...acc, [l._id]: l.count }), {}),
    };
  }

  async purge(olderThanDays: number) {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await LogEntry.deleteMany({ createdAt: { $lt: cutoff } });
    return { deleted: result.deletedCount };
  }
}

export default new LogHandler();
