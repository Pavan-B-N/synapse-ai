import { SearchClient, AzureKeyCredential, SearchIndexClient } from '@azure/search-documents';
import config from '../../config';
import { IVectorStore } from './IVectorStore';

/** Azure Cognitive Search implementation of IVectorStore */
export class AzureSearchStore implements IVectorStore {
  private client: SearchClient<any>;
  private indexClient: SearchIndexClient;
  private indexName: string;

  constructor() {
    const { endpoint, apiKey, indexName } = config.azure.search;
    this.indexName = indexName;
    this.indexClient = new SearchIndexClient(endpoint, new AzureKeyCredential(apiKey));
    this.client = new SearchClient<any>(endpoint, indexName, new AzureKeyCredential(apiKey));
  }

  async ensureIndexExists() {
    try { await this.indexClient.getIndex(this.indexName); }
    catch (error: any) {
      if (error.statusCode === 404) { await this._createIndex(); }
      else throw error;
    }
  }

  private async _createIndex() {
    const index = {
      name: this.indexName,
      fields: [
        { name: 'id', type: 'Edm.String', key: true, filterable: true },
        { name: 'documentId', type: 'Edm.String', filterable: true, facetable: true },
        { name: 'userId', type: 'Edm.String', filterable: true },
        { name: 'title', type: 'Edm.String', searchable: true },
        { name: 'chunkText', type: 'Edm.String', searchable: true },
        { name: 'chunkIndex', type: 'Edm.Int32' },
        { name: 'embedding', type: 'Collection(Edm.Single)', searchable: true, vectorSearchDimensions: 1536, vectorSearchProfileName: 'my-vector-profile' },
      ],
      vectorSearch: {
        algorithms: [{ name: 'my-hnsw', kind: 'hnsw' }],
        profiles: [{ name: 'my-vector-profile', algorithmConfigurationName: 'my-hnsw' }],
      },
    };
    await this.indexClient.createIndex(index as any);
  }

  async addBatch(items: { id: string; embedding: number[]; metadata: any }[]) {
    const docs = items.map((i) => ({
      id: i.id, embedding: i.embedding, documentId: i.metadata.documentId,
      userId: i.metadata.userId, title: i.metadata.title, chunkText: i.metadata.chunkText, chunkIndex: i.metadata.chunkIndex,
    }));
    const results = await this.client.uploadDocuments(docs);
    return results.results.length;
  }

  async search(queryEmbedding: number[], options: any = {}) {
    const { topK = 5, threshold=0, filter = {} } = options;
    let filterStr = '';
    if (filter.userId) filterStr += `userId eq '${filter.userId}'`;
    if (filter.documentId) { if (filterStr) filterStr += ' and '; filterStr += `documentId eq '${filter.documentId}'`; }

    const searchResults = await this.client.search('*', {
      vectorSearchOptions: { queries: [{ kind: 'vector', vector: queryEmbedding, kNearestNeighborsCount: topK, fields: ['embedding'] }] },
      filter: filterStr || undefined, top: topK,
      select: ['id', 'documentId', 'userId', 'title', 'chunkText', 'chunkIndex'],
    });

    const results = [];
    for await (const r of searchResults.results) {
      const score = r.score || 0;
      if(score < threshold) continue;
      results.push({ id: r.document.id, score, metadata: { documentId: r.document.documentId, userId: r.document.userId, title: r.document.title, chunkText: r.document.chunkText, chunkIndex: r.document.chunkIndex } });
    }
    return results;
  }

  async deleteByDocument(documentId: string) {
    const searchResults = await this.client.search('*', { filter: `documentId eq '${documentId}'`, select: ['id'], top: 1000 });
    const ids = [];
    for await (const r of searchResults.results) ids.push({ id: r.document.id });
    if (ids.length > 0) await this.client.deleteDocuments(ids);
    return ids.length;
  }

  async stats() { return { totalVectors: 'N/A (Azure Search)', implementation: 'AzureSearchStore' }; }
  async clear() { }
}
