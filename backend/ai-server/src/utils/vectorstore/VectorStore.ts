import { IVectorStore } from './IVectorStore';

/**
 * VectorStore — delegates to the configured IVectorStore implementation.
 */
class VectorStore implements IVectorStore {
  private store: IVectorStore;

  constructor(store: IVectorStore) {
    this.store = store;
  }

  async addBatch(items: { id: string; embedding: number[]; metadata: any }[]) { return this.store.addBatch(items); }
  async search(queryEmbedding: number[], options: any = {}) { return this.store.search(queryEmbedding, options); }
  async deleteByDocument(documentId: string) { return this.store.deleteByDocument(documentId); }
  async stats() { return this.store.stats(); }
  async clear() { if (this.store.clear) return this.store.clear(); }

  /** Check health of the underlying vector store */
  async healthCheck() {
    try {
      const store = this.store as any;
      if (store.ensureIndexExists) await store.ensureIndexExists();
      return { healthy: true, implementation: this.store.constructor.name };
    } catch (error: any) { return { healthy: false, error: error.message }; }
  }
}

export default VectorStore;
