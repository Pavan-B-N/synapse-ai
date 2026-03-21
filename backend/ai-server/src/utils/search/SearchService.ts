import { IAIService } from '../ai/IAIService';
import { IVectorStore } from '../vectorstore/IVectorStore';
import Document from '../../models/Document';
import QueryHistory from '../../models/QueryHistory';

class SearchService {
  constructor(
    private aiService: IAIService,
    private vectorStore: IVectorStore,
  ) {}

  async semanticSearch(query: string, options: any = {}) {
    const { userId, topK = 10, filter = {} } = options;

    const { embedding } = await this.aiService.createEmbedding(query);
    const searchFilter: any = {};
    if (userId) searchFilter.userId = userId;
    if (filter.documentId) searchFilter.documentId = filter.documentId;

    const results = await this.vectorStore.search(embedding, { topK, threshold: 0.7, filter: searchFilter });

    const documentIds = [...new Set(results.map((r: any) => r.metadata.documentId))];
    const documents = await Document.find({ _id: { $in: documentIds } }).select('title type tags summary status');
    const docMap = new Map(documents.map((d: any) => [d._id.toString(), d]));

    const enrichedResults = results.map((r: any) => {
      const doc = docMap.get(r.metadata.documentId) as any;
      const rawScore = r.score;
      const displayScore = Math.min(98, Math.max(5, ((rawScore - 0.7) / 0.28) * 93 + 5));
      return {
        score: parseFloat((displayScore / 100).toFixed(4)),
        rawScore: parseFloat(rawScore.toFixed(4)),
        chunk: r.metadata.chunkText,
        document: doc ? { id: doc._id, title: doc.title, type: doc.type, tags: doc.tags, summary: doc.summary?.substring(0, 200) }
          : { id: r.metadata.documentId, title: r.metadata.title },
      };
    }).sort((a: any, b: any) => b.score - a.score);

    const response = { query, results: enrichedResults, totalResults: enrichedResults.length };
    return response;
  }

  async hybridSearch(query: string, options: any = {}) {
    const { userId, topK = 10 } = options;
    const textResults = await Document.find({ userId, $text: { $search: query } }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } }).limit(topK).select('title type tags summary');

    const semanticResults = await this.semanticSearch(query, options);
    const seen = new Set();
    const merged: any[] = [];

    for (const r of semanticResults.results) {
      const docId = r.document.id?.toString();
      if (docId && !seen.has(docId)) { seen.add(docId); merged.push({ ...r, searchType: 'semantic' }); }
    }
    for (const doc of textResults) {
      const docId = doc._id.toString();
      if (!seen.has(docId)) { seen.add(docId); merged.push({ score: (doc as any)._doc.score / 10, document: { id: doc._id, title: (doc as any).title, type: (doc as any).type }, searchType: 'text' }); }
    }

    return { query, results: merged, totalResults: merged.length };
  }

  async getSuggestions(query: string, userId: string) {
    const recent = await QueryHistory.find({ userId }).sort({ createdAt: -1 }).limit(5).select('query');
    const docs = await Document.find({ userId }).select('tags');
    const tagCounts: any = {};
    docs.forEach((d: any) => (d.tags || []).forEach((t: string) => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const topTags = Object.entries(tagCounts).sort(([, a]: any, [, b]: any) => b - a).slice(0, 10).map(([tag]) => tag);
    return { recentQueries: recent.map((r: any) => r.query), suggestedTags: topTags };
  }
}

export default SearchService;
