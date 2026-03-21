/**
 * AI SERVER — Public Routes (proxied by gateway)
 */

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/serviceAuth';
import { ValidationError } from '../utils/errors';
import { searchService, recommendationService } from '../utils/container';
import queryHandler from '../utils/handler/QueryHandler';
import contentHandler from '../utils/handler/ContentHandler';
import conversationHandler from '../utils/handler/ConversationHandler';
import analyticsHandler from '../utils/handler/AnalyticsHandler';
import logger from '../Logger';

const router = Router();

/**
 * POST /api/ai/query — Execute a RAG query against indexed documents
 *
 * @body {string}  query              - The question to ask
 * @body {string}  [documentId]       - Scope query to a specific document
 * @body {string}  [conversationId]   - Continue an existing conversation thread
 * @body {string}  [conversationTitle]- Display title for a new conversation
 * @body {boolean} [webSearch]        - Answer from general knowledge instead of RAG
 *
 * @response 200 { success, data: { answer, sources, responseTime, conversationId, recommendations } }
 * @response 403 Conversation access has been revoked
 */
router.post('/query', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { query, documentId, conversationId, conversationTitle, webSearch } = req.body;
    if (!query || query.trim().length === 0) throw new ValidationError('Query is required');

    const result = await queryHandler.handle({
      currentUserId: req.user?.userId || '', query, documentId, conversationId, conversationTitle, webSearch,
      raid: (req as any).raid,
    });
    logger.info('AI query processed', { raid: (req as any).raid, userId: req.user?.userId, meta: { documentId, conversationId, responseTime: result.responseTime } });

    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * POST /api/ai/summarize — Summarize text or a stored document
 *
 * @body {string} [text]       - Raw text to summarize (either text or documentId required)
 * @body {string} [documentId] - Document ID to summarize
 * @body {string} [format]     - Summary format: "brief" | "detailed" | "bullets" (default: "detailed")
 *
 * @response 200 { success, data: { summary, format, originalLength } }
 */
router.post('/summarize', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { text, documentId, format } = req.body;
    const result = await contentHandler.summarize(req.user?.userId || '', text, documentId, format, (req as any).raid);
    logger.info('Document summarized', { raid: (req as any).raid, userId: req.user?.userId, meta: { documentId, format } });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * POST /api/ai/generate — Generate content (report, briefing, etc.) from documents
 *
 * @body {string}   [type]        - Generation type: "report" | "briefing" | "outline" | "custom" (default: "report")
 * @body {string[]} [documentIds] - Source document IDs to generate from
 * @body {string}   [prompt]      - Custom instructions or additional context
 *
 * @response 200 { success, data: { content, type, sourcesCount } }
 */
router.post('/generate', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { type, documentIds, prompt } = req.body;
    const result = await contentHandler.generate(req.user?.userId || '', type, documentIds, prompt, (req as any).raid);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * GET /api/ai/search — Semantic search across indexed documents
 *
 * @query {string} q          - Search query text
 * @query {number} [topK]     - Max results to return (default: 10)
 * @query {string} [documentId] - Filter to a specific document
 *
 * @response 200 { success, data: SearchResult[] }
 */
router.get('/search', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { q, topK, documentId } = req.query as any;
    if (!q || q.trim().length === 0) throw new ValidationError('Search query (q) is required');
    const results = await searchService.semanticSearch(q, { userId: req.user?.userId || '', topK: parseInt(topK) || 10, filter: documentId ? { documentId } : {} });
    res.json({ success: true, data: results });
  } catch (error) { next(error); }
});

/**
 * GET /api/ai/recommendations — Get content recommendations for the user
 *
 * @query {string} [documentId] - Get recommendations related to a specific document
 *
 * @response 200 { success, data: { followUpQueries, relatedDocuments } }
 */
router.get('/recommendations', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { documentId } = req.query as any;
    const recommendations = await recommendationService.getRecommendations(req.user?.userId || '', { documentId });
    res.json({ success: true, data: recommendations });
  } catch (error) { next(error); }
});

/**
 * GET /api/ai/history — Paginated query history for the current user
 *
 * @query {number} [page]  - Page number (default: 1)
 * @query {number} [limit] - Results per page (default: 20)
 *
 * @response 200 { success, data: { queries, pagination: { page, limit, total } } }
 */
router.get('/history', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '20' } = req.query as any;
    const result = await conversationHandler.getHistory(req.user?.userId || '', parseInt(page), parseInt(limit));
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * GET /api/ai/conversations — List all conversations (owned + shared) for the user
 *
 * @response 200 { success, data: { owned: Conversation[], shared: Conversation[] } }
 */
router.get('/conversations', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await conversationHandler.listConversations(req.user?.userId || '');
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * POST /api/ai/conversations/:conversationId/share — Share a conversation with another user
 *
 * @param  {string} conversationId - Conversation to share
 * @body   {string} targetUserId   - User ID to share with
 *
 * @response 200 { success: true }
 * @response 403 Only the conversation owner can share
 */
router.post('/conversations/:conversationId/share', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId || '';
    await conversationHandler.shareConversation(userId, req.params.conversationId as string, req.body.targetUserId);
    res.json({ success: true });
  } catch (error) { next(error); }
});

/**
 * DELETE /api/ai/conversations/:conversationId/share/:targetUserId — Revoke shared access
 *
 * @param {string} conversationId - Conversation to unshare
 * @param {string} targetUserId   - User ID to revoke access from
 *
 * @response 200 { success: true }
 */
router.delete('/conversations/:conversationId/share/:targetUserId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId || '';
    await conversationHandler.unshareConversation(userId, req.params.conversationId as string, req.params.targetUserId as string);
    res.json({ success: true });
  } catch (error) { next(error); }
});

/**
 * GET /api/ai/conversations/:conversationId/shared-users — List users a conversation is shared with
 *
 * @param {string} conversationId - Conversation to check
 *
 * @response 200 { success, data: { sharedWith: string[] } }
 * @response 404 Conversation not found
 */
router.get('/conversations/:conversationId/shared-users', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await conversationHandler.getSharedUsers(req.user?.userId || '', req.params.conversationId as string);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * GET /api/ai/history/conversation/:conversationId — Get all messages in a conversation
 *
 * @param {string} conversationId - Conversation to retrieve
 *
 * @response 200 { success, data: { queries: QueryHistory[] } }
 * @response 403 Access to this conversation has been revoked
 */
router.get('/history/conversation/:conversationId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await conversationHandler.getConversationHistory(req.user?.userId || '', req.params.conversationId as string);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * GET /api/ai/history/:documentId — Query history for a specific document
 *
 * @param  {string} documentId - Document to get history for
 * @query  {number} [page]     - Page number (default: 1)
 * @query  {number} [limit]    - Results per page (default: 50)
 *
 * @response 200 { success, data: { queries: QueryHistory[] } }
 */
router.get('/history/:documentId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '50' } = req.query as any;
    const result = await conversationHandler.getDocumentHistory(req.user?.userId || '', req.params.documentId as string, parseInt(page), parseInt(limit));
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * GET /api/ai/analytics — AI usage analytics for the current user
 *
 * @response 200 { success, data: { totalQueries, avgResponseTime, queriesByDay, topDocuments, vectorStore, aiProvider } }
 */
router.get('/analytics', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await analyticsHandler.getAnalytics(req.user?.userId || '');
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * DELETE /api/ai/conversations/:conversationId — Delete a conversation (owner only)
 *
 * @param {string} conversationId - Conversation to delete
 *
 * @response 200 { success: true, message: "Conversation deleted" }
 * @response 403 Only the owner can delete this conversation
 * @response 404 Conversation not found
 */
router.delete('/conversations/:conversationId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await conversationHandler.deleteConversation(req.user?.userId || '', req.params.conversationId as string);
    logger.info('Conversation deleted', { raid: (req as any).raid, userId: req.user?.userId, meta: { conversationId: req.params.conversationId } });
    res.json({ success: true, message: 'Conversation deleted' });
  } catch (error) { next(error); }
});

export default router;
