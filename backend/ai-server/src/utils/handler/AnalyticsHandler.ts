import mongoose from 'mongoose';
import QueryHistory from '../../models/QueryHistory';
import { aiService, ragService } from '../container';

class AnalyticsHandler {
  async getAnalytics(userId: string) {
    const uid = new mongoose.Types.ObjectId(userId);
    const [totalQueries, avgResponseTime, queriesByDay, topDocs] = await Promise.all([
      QueryHistory.countDocuments({ userId }),
      QueryHistory.aggregate([{ $match: { userId: uid } }, { $group: { _id: null, avg: { $avg: '$responseTime' } } }]),
      QueryHistory.aggregate([
        { $match: { userId: uid, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      QueryHistory.aggregate([
        { $match: { userId: uid, documentId: { $ne: null } } },
        { $group: { _id: '$documentId', queryCount: { $sum: 1 } } },
        { $sort: { queryCount: -1 } }, { $limit: 5 },
      ]),
    ]);

    const vectorStats = await ragService.getStats();

    return {
      totalQueries,
      avgResponseTime: avgResponseTime[0]?.avg || 0,
      queriesByDay,
      topDocuments: topDocs,
      vectorStore: vectorStats,
      aiProvider: aiService.getProviderName(),
    };
  }
}

export default new AnalyticsHandler();
