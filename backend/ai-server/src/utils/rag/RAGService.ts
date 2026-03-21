import { v4 as uuidv4 } from 'uuid';
import { IAIService } from '../ai/IAIService';
import { IVectorStore } from '../vectorstore/IVectorStore';
import Document from '../../models/Document';
import { chunkText } from '../helpers';
import logger from '../../Logger';

class RAGService {
  private defaultChunkOptions = { chunkSize: 150, overlap: 50 };

  constructor(
    private aiService: IAIService,
    private vectorStore: IVectorStore,
  ) {}

  async processDocument(document: any) {
    const { _id: documentId, content, title, userId } = document;

    try {
      logger.info('RAG.processDocument: starting embedding pipeline', { userId, meta: { documentId: documentId.toString(), title, contentLen: content?.length ?? 0 } });
      await Document.findByIdAndUpdate(documentId, { embeddingStatus: 'processing' });
      const chunks = chunkText(content, this.defaultChunkOptions);
      logger.info('RAG.processDocument: text chunked', { userId, meta: { documentId: documentId.toString(), chunkCount: chunks.length } });
      if (chunks.length === 0) {
        await Document.findByIdAndUpdate(documentId, { embeddingStatus: 'complete', chunkCount: 0 });
        logger.info('RAG.processDocument: no chunks to embed, marking complete', { userId, meta: { documentId: documentId.toString() } });
        return { chunkCount: 0 };
      }

      const batchSize = 20;
      let totalEmbedded = 0;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        logger.info('RAG.processDocument: generating embeddings for batch', { userId, meta: { documentId: documentId.toString(), batchStart: i, batchSize: batch.length } });
        const { embeddings } = await this.aiService.createBatchEmbeddings(batch.map((c) => c.text));
        const items = batch.map((chunk, idx) => ({
          id: uuidv4(),
          embedding: embeddings[idx],
          metadata: { documentId: documentId.toString(), userId: userId.toString(), title, chunkText: chunk.text, chunkIndex: i + idx, startIndex: chunk.startIndex, endIndex: chunk.endIndex },
        }));
        logger.info('RAG.processDocument: storing embeddings in vector store', { userId, meta: { documentId: documentId.toString(), itemCount: items.length } });
        await this.vectorStore.addBatch(items);
        totalEmbedded += items.length;
      }

      await Document.findByIdAndUpdate(documentId, { embeddingStatus: 'complete', chunkCount: totalEmbedded });
      logger.info('RAG.processDocument: embedding pipeline complete', { userId, meta: { documentId: documentId.toString(), totalEmbedded } });
      return { chunkCount: totalEmbedded };
    } catch (error: any) {
      await Document.findByIdAndUpdate(documentId, { embeddingStatus: 'error' });
      logger.error('RAG.processDocument: embedding pipeline failed', { userId, meta: { documentId: documentId.toString(), error: error.message } });
      throw error;
    }
  }

  async query(queryText: string, options: any = {}) {
    const { userId, topK = 5, documentId = null, history = [], raid } = options;
    const startTime = Date.now();

    logger.info('RAG.query: generating query embedding', { raid, userId, meta: { queryLen: queryText.length, documentId } });
    const { embedding: queryEmbedding } = await this.aiService.createEmbedding(queryText);

    const searchOptions: any = { topK, threshold: 0.05 };
    if (documentId) searchOptions.filter = { documentId };
    if (userId) searchOptions.filter = { ...searchOptions.filter, userId };

    logger.info('RAG.query: searching vector store', { raid, userId, meta: { topK, documentId } });
    const results = await this.vectorStore.search(queryEmbedding, searchOptions);
    logger.info('RAG.query: vector search complete', { raid, userId, meta: { resultCount: results.length, searchTimeMs: Date.now() - startTime } });

    if (results.length === 0 && history.length === 0) {
      logger.info('RAG.query: no relevant documents found', { raid, userId, meta: { documentId } });
      return { answer: "I couldn't find any relevant information in the knowledge base for your query. Try uploading more documents or rephrasing your question.", sources: [], responseTime: Date.now() - startTime };
    }

    const context = results.map((r: any, i: number) => `[Source ${i + 1}: ${r.metadata.title}]\n${r.metadata.chunkText}`).join('\n\n---\n\n');
    const historyContext = history.slice(-5).map((h: any) => `User: ${h.query}\nAI: ${h.answer}`).join('\n\n');

    const prompt = `You are a knowledgeable AI assistant. Answer the user's question based on the following context from their documents. Be specific and cite your sources.
${historyContext ? `\nCONVERSATION HISTORY:\n${historyContext}\n` : ''}
CONTEXT:
${context}

USER QUESTION: ${queryText}

Provide a clear, well-structured answer. If the context doesn't fully answer the question, say what you can determine from the context and indicate what additional information might be needed.`;

    logger.info('RAG.query: calling AI for answer generation', { raid, userId, meta: { contextSources: results.length, historyMessages: history.length, promptLen: prompt.length } });
    const { text: answer } = await this.aiService.completePrompt(prompt, { maxTokens: 1500, temperature: 0.3 });
    logger.info('RAG.query: AI answer received', { raid, userId, meta: { answerLen: answer.length, totalTimeMs: Date.now() - startTime } });

    const sources = results.map((r: any) => ({
      documentId: r.metadata.documentId,
      title: r.metadata.title,
      relevanceScore: parseFloat(r.score.toFixed(4)),
      chunkText: r.metadata.chunkText.substring(0, 200) + '...',
    }));

    return { answer, sources, responseTime: Date.now() - startTime };
  }

  getStats() { return this.vectorStore.stats(); }
}

export default RAGService;
