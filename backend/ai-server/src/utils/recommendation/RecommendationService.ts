import Document from '../../models/Document';
import { IAIService } from '../ai/IAIService';
import { IVectorStore } from '../vectorstore/IVectorStore';
import { IRecommendationService } from './IRecommendationService';

/**
 * RecommendationService — provides document recommendations, follow-up queries,
 * and knowledge gap suggestions based on a user's document library.
 */
class RecommendationService implements IRecommendationService {
  constructor(
    private aiService: IAIService,
    private vectorStore: IVectorStore,
  ) { }
  async getRecommendations(userId: string, options: any = {}) {
    const { documentId, query, limit = 5 } = options;
    const recommendations: { relatedDocuments: any[]; followUpQueries: string[]; missingKnowledge: string[] } = {
      relatedDocuments: [], followUpQueries: [], missingKnowledge: [],
    };

    try {
      if (documentId) recommendations.relatedDocuments = await this._getRelatedDocuments(documentId, userId, limit);
      if (query) recommendations.followUpQueries = await this._getFollowUpQueries(query);
      recommendations.missingKnowledge = await this._getMissingKnowledge(userId);
    } catch (error: any) { /* noop */ }
    return recommendations;
  }

  private async _getRelatedDocuments(documentId: string, userId: string, limit: number) {
    const doc = await Document.findById(documentId);
    if (!doc || !(doc as any).content) return [];
    const searchText = (doc as any).summary || (doc as any).content.substring(0, 500);
    const { embedding } = await this.aiService.createEmbedding(searchText);
    const results = await this.vectorStore.search(embedding, { topK: limit * 2, threshold: 0.1, filter: { userId } });

    const seen = new Set([documentId.toString()]);
    const related = [];
    for (const result of results) {
      const docId = result.metadata.documentId;
      if (!seen.has(docId)) {
        seen.add(docId);
        const relatedDoc = await Document.findById(docId).select('title type tags summary createdAt');
        if (relatedDoc) related.push({ document: relatedDoc, relevanceScore: parseFloat(result.score.toFixed(4)) });
      }
      if (related.length >= limit) break;
    }
    return related;
  }

  private async _getFollowUpQueries(query: string) {
    try {
      const result = await this.aiService.completePrompt(
        `Based on this query: "${query}", suggest 3 follow-up questions the user might want to ask. Return as JSON array of strings.`,
        { maxTokens: 200, temperature: 0.7 }
      );
      return JSON.parse(result.text);
    } catch {
      return [`Tell me more about ${query}`, `What are the implications of ${query}?`, `How does ${query} relate to my other documents?`];
    }
  }

  private async _getMissingKnowledge(userId: string) {
    try {
      const docs = await Document.find({ userId }).select('tags title');
      if (docs.length === 0) return ['Upload your first document to get started'];
      const allTags = docs.flatMap((d: any) => d.tags || []);
      const tagSet = new Set(allTags);
      const suggestions: string[] = [];
      if (!tagSet.has('strategy')) suggestions.push('Consider uploading strategic planning documents');
      if (!tagSet.has('finance')) suggestions.push('Financial analysis documents could enhance insights');
      if (docs.length < 5) suggestions.push('Upload more documents for better cross-referencing');
      return suggestions.slice(0, 3);
    } catch { return []; }
  }
}

export default RecommendationService;
