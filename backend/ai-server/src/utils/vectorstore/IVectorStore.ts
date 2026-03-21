/** Interface for vector storage implementations */
export interface IVectorStore {
  /** Upsert a batch of embedding vectors with metadata */
  addBatch(items: { id: string; embedding: number[]; metadata: any }[]): Promise<number>;
  /** Search for nearest neighbours of the given embedding */
  search(queryEmbedding: number[], options?: { topK?: number; threshold?: number; filter?: Record<string, string> }): Promise<{ id: string; score: number; metadata: any }[]>;
  /** Delete all vectors associated with a document */
  deleteByDocument(documentId: string): Promise<number>;
  /** Return implementation-specific statistics */
  stats(): Promise<Record<string, any>>;
  /** Clear all stored vectors (if supported) */
  clear(): Promise<void>;
}
