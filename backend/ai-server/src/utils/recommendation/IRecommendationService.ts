/** Result shape returned by the recommendation service */
export interface RecommendationResult {
  relatedDocuments: { document: any; relevanceScore: number }[];
  followUpQueries: string[];
  missingKnowledge: string[];
}

/** Interface for recommendation service implementations */
export interface IRecommendationService {
  /** Get AI-powered recommendations for a user, optionally scoped to a document or query */
  getRecommendations(userId: string, options?: { documentId?: string; query?: string; limit?: number }): Promise<RecommendationResult>;
}
