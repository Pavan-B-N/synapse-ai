import QueryHistory from '../../models/QueryHistory';
import { aiService, ragService, recommendationService } from '../container';
import { broadcastToRoom } from '../broadcast/GatewayBroadcaster';
import { ForbiddenError } from '../errors';
import logger from '../../Logger';

interface QueryParams {
  currentUserId: string;
  query: string;
  documentId?: string;
  conversationId?: string;
  conversationTitle?: string;
  webSearch?: boolean;
  raid?: string;
}

class QueryHandler {
  async handle(params: QueryParams) {
    const { currentUserId, query, documentId, conversationId: reqConversationId, conversationTitle, webSearch, raid } = params;
    const conversationId = reqConversationId || `${Date.now()}`;

    logger.info('Query.handle: resolving conversation access', { raid, userId: currentUserId, meta: { conversationId, documentId, webSearch } });
    const { effectiveUserId, sharedWith } = await this.resolveConversationAccess(conversationId, documentId, currentUserId);

    logger.info('Query.handle: fetching conversation history', { raid, userId: currentUserId, meta: { conversationId } });
    const recentHistory = await QueryHistory.find({
      conversationId,
      $or: [{ userId: effectiveUserId }, { sharedWith: currentUserId }],
      documentId: documentId || null,
    }).sort({ createdAt: -1 }).limit(5);
    logger.info('Query.handle: history loaded', { raid, userId: currentUserId, meta: { historyCount: recentHistory.length } });

    let result;
    if (webSearch) {
      logger.info('Query.handle: executing web/general knowledge query', { raid, userId: currentUserId, meta: { queryLen: query.length } });
      result = await this.webSearchQuery(query, recentHistory);
    } else {
      logger.info('Query.handle: executing RAG query against vector store', { raid, userId: currentUserId, meta: { queryLen: query.length, documentId } });
      result = await ragService.query(query, { userId: effectiveUserId, documentId, history: recentHistory.reverse(), raid });
    }
    logger.info('Query.handle: query result received', { raid, userId: currentUserId, meta: { responseTime: result.responseTime, sourceCount: result.sources.length, answerLen: result.answer.length } });

    logger.info('Query.handle: saving query to history', { raid, userId: currentUserId, meta: { conversationId } });
    await QueryHistory.create({
      userId: effectiveUserId, documentId: documentId || null, query,
      answer: result.answer, sourceDocuments: result.sources, responseTime: result.responseTime,
      conversationId, conversationTitle: conversationTitle || query.substring(0, 30) + (query.length > 30 ? '...' : ''),
      sharedWith: sharedWith.length > 0 ? sharedWith : undefined,
    });

    if (sharedWith.length > 0) {
      logger.info('Query.handle: broadcasting to shared users', { raid, userId: currentUserId, meta: { conversationId, sharedCount: sharedWith.length } });
      try {
        broadcastToRoom(`conversation:${conversationId}`, 'conversation:message', {
          conversationId, query, answer: result.answer, sources: result.sources,
          recommendations: [], senderUserId: currentUserId,
        });
      } catch (err: any) {
        logger.warn('Query.handle: broadcast failed', { raid, userId: currentUserId, meta: { error: err.message } });
      }
    }

    logger.info('Query.handle: fetching recommendations', { raid, userId: currentUserId });
    const recommendations = await recommendationService.getRecommendations(effectiveUserId, { query });
    logger.info('Query.handle: complete', { raid, userId: currentUserId, meta: { conversationId, responseTime: result.responseTime } });

    return { ...result, conversationId, recommendations: recommendations.followUpQueries };
  }

  private async resolveConversationAccess(conversationId: string, documentId: string | undefined, currentUserId: string) {
    let effectiveUserId = currentUserId;
    let sharedWith: any[] = [];

    const existingEntry = await QueryHistory.findOne({ conversationId, documentId: documentId || null });
    if (existingEntry) {
      const entryOwnerId = (existingEntry as any).userId?.toString();
      const entrySharedWith = (existingEntry as any).sharedWith || [];

      if (entryOwnerId === currentUserId) {
        sharedWith = entrySharedWith;
      } else if (entrySharedWith.some((id: any) => id.toString() === currentUserId)) {
        effectiveUserId = entryOwnerId;
        sharedWith = entrySharedWith;
      } else {
        throw new ForbiddenError('Access to this conversation has been revoked. You no longer have permission to send messages here.');
      }
    }

    return { effectiveUserId, sharedWith };
  }

  private async webSearchQuery(query: string, recentHistory: any[]) {
    const historyContext = recentHistory.slice(-5).map((h: any) => `User: ${h.query}\nAI: ${h.answer}`).join('\n\n');
    const prompt = `${historyContext ? `CONVERSATION HISTORY:\n${historyContext}\n\n` : ''}USER QUESTION: ${query}\n\nProvide a clear, well-structured, and informative answer based on your general knowledge. If you're unsure about specific facts, indicate so.`;
    const startTime = Date.now();
    const { text: answer } = await aiService.completePrompt(prompt, {
      maxTokens: 1500,
      temperature: 0.5,
      systemPrompt: 'You are a knowledgeable AI assistant. The user has enabled web/browse mode. Answer using your general training knowledge. Be factual and comprehensive. When you are not certain, say so.',
    });
    return { answer, sources: [], responseTime: Date.now() - startTime };
  }
}

export default new QueryHandler();
