/**
 * CORE SERVER — Quiz Routes
 */

import { Router, Request, Response } from 'express';
import { ValidationError } from '../utils/errors';
import quizHandler from '../utils/handler/QuizHandler';
import logger from '../Logger';

const router = Router();

interface IdParams { id: string }

/**
 * POST /api/quiz/generate — Generate a quiz from a document using AI
 *
 * @body {string} documentId           - Source document to generate questions from
 * @body {number} [numberOfQuestions=5] - Number of questions (0 = random 5-25)
 * @body {string} [difficulty=medium]   - Difficulty level: easy | medium | hard
 *
 * @response 201 { success, data: Quiz } (answers stripped for pending quizzes)
 */
router.post('/generate', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) throw new ValidationError('User context required');

  const { documentId, numberOfQuestions, difficulty } = req.body;
  if (!documentId) throw new ValidationError('documentId is required');

  const quiz = await quizHandler.generate(userId, documentId, numberOfQuestions, difficulty, (req as any).raid);
  logger.info('Quiz generated', { raid: (req as any).raid, userId, meta: { documentId, difficulty } });
  res.status(201).json({ success: true, data: quiz });
});

/**
 * POST /api/quiz/:id/submit — Submit quiz answers and get score
 *
 * @param  {string}   id      - Quiz ID
 * @body   {number[]} answers - Array of selected option indices (0-based)
 *
 * @response 200 { success, data: { quizId, score, total, percentage, questions } }
 */
router.post('/:id/submit', async (req: Request<IdParams>, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) throw new ValidationError('User context required');

  const result = await quizHandler.submit(userId, req.params.id, req.body.answers);
  res.json({ success: true, data: result });
});

/**
 * GET /api/quiz/history — Paginated quiz history (answers excluded)
 *
 * @query {number} [page=1]   - Page number
 * @query {number} [limit=20] - Results per page (max 100)
 *
 * @response 200 { success, data: Quiz[], pagination }
 */
router.get('/history', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) throw new ValidationError('User context required');

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const result = await quizHandler.getHistory(userId, page, limit);
  res.json({ success: true, data: result.quizzes, pagination: result.pagination });
});

/**
 * GET /api/quiz/:id — Get a specific quiz (answers hidden if not completed)
 *
 * @param {string} id - Quiz ID
 *
 * @response 200 { success, data: Quiz }
 * @response 404 Quiz not found
 */
router.get('/:id', async (req: Request<IdParams>, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) throw new ValidationError('User context required');

  const quiz = await quizHandler.getById(userId, req.params.id);
  res.json({ success: true, data: quiz });
});

export default router;
