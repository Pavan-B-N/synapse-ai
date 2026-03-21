/**
 * IAIService — Contract for AI service operations.
 * Implement this interface to swap AI orchestration strategies.
 */
export interface IAIService {
  /** Generates a text completion from a prompt with retry logic */
  completePrompt(prompt: string, options?: any): Promise<{ text: string; fromCache: boolean; usage?: any }>;
  /** Creates a single embedding vector from input text */
  createEmbedding(text: string): Promise<{ embedding: number[]; dimensions: number }>;
  /** Creates embedding vectors for multiple texts in batch */
  createBatchEmbeddings(texts: string[]): Promise<{ embeddings: number[][]; dimensions: number }>;
  /** Checks the health of the underlying AI provider */
  checkHealth(): Promise<{ healthy: boolean; provider: string; details?: any }>;
  /** Returns the name of the active AI provider */
  getProviderName(): string;
}
