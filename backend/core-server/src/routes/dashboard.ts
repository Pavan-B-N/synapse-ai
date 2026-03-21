/**
 * CORE SERVER — Dashboard Routes
 */

import { Router, Request, Response } from 'express';
import Quiz from '../models/Quiz';
import DocGroup from '../models/DocGroup';
import { documentClient } from '../utils/client/DocumentClient';
import { aiClient } from '../utils/client/AIClient';
import { ValidationError } from '../utils/errors';

const router = Router();

/**
 * GET /api/dashboard/stats — Aggregated dashboard statistics
 *
 * @response 200 { success, data: { documents, quizzes, groups, recentQuizzes, recentDocuments, recentQueries, services } }
 */
router.get('/stats', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) throw new ValidationError('User context required');
  const raid = (req as any).raid;

  const [quizStats, groupCount, recentQuizzes, docData, recentDocsData, recentQueriesData] = await Promise.all([
    Quiz.aggregate([
      { $match: { userId: require('mongoose').Types.ObjectId.createFromHexString(userId) } },
      {
        $group: {
          _id: null,
          totalQuizzes: { $sum: 1 },
          completedQuizzes: { $sum: { $cond: [{ $ifNull: ['$completedAt', false] }, 1, 0] } },
          avgScore: { $avg: { $cond: [{ $ifNull: ['$completedAt', false] }, { $multiply: [{ $divide: ['$score', '$totalQuestions'] }, 100] }, null] } },
          totalQuestions: { $sum: '$totalQuestions' },
        },
      },
    ]),
    DocGroup.countDocuments({ userId }),
    Quiz.find({ userId, completedAt: { $ne: null } }).sort({ completedAt: -1 }).limit(5).select('title score totalQuestions completedAt'),
    documentClient.listDocuments(userId, 1, 1, raid).catch(() => ({ pagination: { total: 0 } })),
    documentClient.listDocuments(userId, 1, 5, raid).catch(() => ({ documents: [] })),
    aiClient.getQueryHistory(userId, 5, raid).catch(() => []),
  ]);

  const stats = quizStats[0] || { totalQuizzes: 0, completedQuizzes: 0, avgScore: 0, totalQuestions: 0 };

  res.json({
    success: true,
    data: {
      documents: { total: docData?.pagination?.total || 0 },
      quizzes: {
        total: stats.totalQuizzes,
        completed: stats.completedQuizzes,
        avgScore: Math.round(stats.avgScore || 0),
        totalQuestions: stats.totalQuestions,
      },
      groups: { total: groupCount },
      recentQuizzes,
      recentDocuments: recentDocsData?.documents || [],
      recentQueries: recentQueriesData || [],
      services: {
        aiServer: aiClient.status,
        documentServer: documentClient.status,
      },
    },
  });
});

export default router;
