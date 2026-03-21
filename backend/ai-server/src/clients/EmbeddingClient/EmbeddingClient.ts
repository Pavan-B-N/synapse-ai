export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  dimensions: number;
}

/**
 * EmbeddingClient — Abstract client for embedding APIs.
 * Implement this to support different providers (Azure, OpenAI, etc.).
 */
export abstract class EmbeddingClient {
  abstract embed(text: string): Promise<EmbeddingResult>;
  abstract embedBatch(texts: string[]): Promise<BatchEmbeddingResult>;
}

export default EmbeddingClient;
