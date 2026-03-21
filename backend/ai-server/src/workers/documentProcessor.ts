import fs from 'fs';
import mongoose from 'mongoose';
import pdfParse from 'pdf-parse';
import Document from '../models/Document';
import DocumentSummary from '../models/DocumentSummary';
import { aiService, ragService, vectorStore } from '../utils/container';
import { broadcastDocStatus } from '../utils/broadcast/GatewayBroadcaster';
import logger from '../Logger';

const CONTENT_CHUNK_CHARS = 5000;

/**
 * Process a document: extract text, run AI analysis, index into vector store.
 * Called directly (no BullMQ — Redis disabled).
 */
export async function processDocument(documentId: string) {

  const document = await Document.findById(documentId);
  if (!document) { logger.warn('DocProcessor: document not found, skipping', { meta: { documentId } }); return; }
  const userId = (document as any).userId?.toString();

  try {
    logger.info('DocProcessor: starting document processing', { userId, meta: { documentId, type: (document as any).type, filePath: document.filePath } });
    let content = '';
    switch ((document as any).type) {
      case 'pdf':
        logger.info('DocProcessor: extracting text from PDF', { userId, meta: { documentId } });
        content = await extractPdfText(document.filePath);
        break;
      case 'text':
        logger.info('DocProcessor: reading text file', { userId, meta: { documentId } });
        content = fs.readFileSync(document.filePath, 'utf-8');
        break;
      default:
        logger.info('DocProcessor: reading file as text (fallback)', { userId, meta: { documentId, type: (document as any).type } });
        try { content = fs.readFileSync(document.filePath, 'utf-8'); } catch { content = ''; }
    }
    logger.info('DocProcessor: text extracted', { userId, meta: { documentId, contentLen: content.length } });

    if (!content || content.trim().length === 0) {
      logger.warn('DocProcessor: no content extracted, marking ready without AI analysis', { userId, meta: { documentId } });
      await Document.findByIdAndUpdate(documentId, { status: 'ready', content: '' });
      if (userId) broadcastDocStatus(documentId, userId, { status: 'ready' });
      return;
    }

    logger.info('DocProcessor: running AI analysis (summary + tags + keyPoints)', { userId, meta: { documentId } });
    const [summaryResult, tagsResult, keyPointsResult] = await Promise.allSettled([
      aiService.completePrompt(`Summarize the following document concisely:\n\n${content.substring(0, 5000)}`, { maxTokens: 500, temperature: 0.3 }),
      aiService.completePrompt(`Extract 5-8 relevant tags/keywords from this text as a JSON array of strings:\n\n${content.substring(0, 3000)}`, { maxTokens: 100, temperature: 0.1 }),
      aiService.completePrompt(`Extract 5 key points from this text as a JSON array of strings:\n\n${content.substring(0, 5000)}`, { maxTokens: 300, temperature: 0.2 }),
    ]);
    logger.info('DocProcessor: AI analysis complete', { userId, meta: {
      documentId,
      summaryOk: summaryResult.status === 'fulfilled',
      tagsOk: tagsResult.status === 'fulfilled',
      keyPointsOk: keyPointsResult.status === 'fulfilled',
    } });

    const update: any = { content, status: 'ready' };
    if (summaryResult.status === 'fulfilled') update.summary = summaryResult.value.text;
    if (tagsResult.status === 'fulfilled') { try { update.tags = JSON.parse(tagsResult.value.text); } catch { update.tags = []; } }
    if (keyPointsResult.status === 'fulfilled') { try { update.keyPoints = JSON.parse(keyPointsResult.value.text); } catch { update.keyPoints = []; } }

    await Document.findByIdAndUpdate(documentId, update);

    // Store content chunks in DocumentContent collection for document-server
    logger.info('DocProcessor: storing content chunks', { userId, meta: { documentId, contentLen: content.length } });
    try {
      const dcCollection = mongoose.connection.collection('documentcontents');
      const oid = new mongoose.Types.ObjectId(documentId);
      await dcCollection.deleteMany({ documentId: oid });
      const contentChunks: any[] = [];
      for (let i = 0; i < content.length; i += CONTENT_CHUNK_CHARS) {
        const chunk = content.substring(i, i + CONTENT_CHUNK_CHARS);
        contentChunks.push({
          documentId: oid,
          chunkIndex: Math.floor(i / CONTENT_CHUNK_CHARS),
          content: chunk,
          characterCount: chunk.length,
        });
      }
      if (contentChunks.length > 0) {
        await dcCollection.insertMany(contentChunks);
      }
      await Document.findByIdAndUpdate(documentId, { totalContentChunks: contentChunks.length });
      logger.info('DocProcessor: content chunks stored', { userId, meta: { documentId, chunks: contentChunks.length } });
    } catch (chunkErr: any) {
      logger.warn('DocProcessor: failed to store content chunks (non-fatal)', { userId, meta: { documentId, error: chunkErr.message } });
    }

    // Persist summary, tags, and key points to the shared DocumentSummary collection
    // so the document-server can serve them via its API.
    logger.info('DocProcessor: persisting summary to shared collection', { userId, meta: { documentId } });
    const summaryData: any = {};
    if (update.summary) summaryData.summary = update.summary;
    if (update.tags) summaryData.tags = update.tags;
    if (update.keyPoints) summaryData.keyPoints = update.keyPoints;
    if (Object.keys(summaryData).length > 0) {
      await DocumentSummary.findOneAndUpdate(
        { documentId },
        { $set: summaryData },
        { upsert: true },
      );
    }

    // Broadcast real-time status update to frontend
    if (userId) {
      broadcastDocStatus(documentId, userId, {
        status: 'ready',
        summary: !!update.summary,
        tags: update.tags?.length || 0,
      });
    }

    logger.info('DocProcessor: starting RAG embedding pipeline', { userId, meta: { documentId } });
    const docForRAG = { ...document.toObject(), ...update, _id: document._id };
    await ragService.processDocument(docForRAG);
    logger.info('DocProcessor: document processing complete', { userId, meta: { documentId } });

  } catch (error: any) {
    logger.error('DocProcessor: document processing failed', { userId, meta: { documentId, error: error.message, stack: error.stack } });
    await Document.findByIdAndUpdate(documentId, { status: 'error' });
    if (userId) broadcastDocStatus(documentId, userId, { status: 'error' });
  }
}

export async function deleteVectors(documentId: string) {
  try {
    logger.info('DeleteVectors: deleting vectors for document', { meta: { documentId } });
    const count = await vectorStore.deleteByDocument(documentId);
    logger.info('DeleteVectors: vectors deleted', { meta: { documentId, count } });
  } catch (error: any) {
    logger.error('DeleteVectors: failed', { meta: { documentId, error: error.message } });
  }
}

async function extractPdfText(filePath: string): Promise<string> {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error: any) { return ''; }
}
