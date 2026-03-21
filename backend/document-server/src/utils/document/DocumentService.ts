import fs from 'fs';
import path from 'path';
import Document from '../../models/Document';
import DocumentContent from '../../models/DocumentContent';
import DocumentSummary from '../../models/DocumentSummary';
import EventLog from '../../models/EventLog';
import config from '../../config';
import { generateIdempotencyKey } from '../helpers';
import { RedisBloomFilter } from '../bloom/RedisBloomFilter';
import redis from '../../connections/redis';
import { documentQueue, vectorCleanupQueue } from '../publisher';
import { DocumentType, DEFAULT_CONTENT_CHUNK_SIZE } from '../../constants';
import logger from '../../Logger';

// Redis-backed bloom filter — survives restarts, shared across instances
const uploadBloom = new RedisBloomFilter(redis, 'bloom:upload-dedup', 50000, 7);

/** Size of each content chunk stored in DocumentContent collection */
const CONTENT_CHUNK_CHARS = 5000;

/**
 * DocumentService — Manages document lifecycle operations.
 * Uses split collections for content and summary data.
 */
class DocumentService {
  constructor() {
    const dir = path.resolve(config.storage.uploadDir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  /** Saves an uploaded file with idempotency checks */
  async saveUpload(file: any, userId: string, raid?: string) {
    const idempotencyKey = generateIdempotencyKey(userId, file.originalname, file.size.toString());

    logger.info('Upload: checking bloom filter for duplicate', { raid, userId, meta: { filename: file.originalname, size: file.size } });
    if (await uploadBloom.mightContain(idempotencyKey)) {
      const existing = await Document.findOne({ idempotencyKey });
      if (existing) {
        logger.info('Upload: duplicate detected via bloom filter', { raid, userId, meta: { documentId: existing._id.toString(), filename: file.originalname } });
        return { document: existing, duplicate: true };
      }
    }

    const fileType = this.resolveFileType(file.mimetype, file.originalname);
    logger.info('Upload: resolved file type, creating document record', { raid, userId, meta: { filename: file.originalname, fileType } });

    let document;
    try {
      document = await Document.create({
        title: path.parse(file.originalname).name,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        filePath: file.path,
        userId,
        type: fileType,
        status: 'processing',
        idempotencyKey,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        logger.info('Upload: duplicate key on insert, returning existing', { raid, userId, meta: { filename: file.originalname } });
        const existing = await Document.findOne({ idempotencyKey });
        if (existing) {
          return { document: existing, duplicate: true };
        }
      }
      throw err;
    }

    logger.info('Upload: document record created, adding to bloom filter', { raid, userId, meta: { documentId: document._id.toString() } });
    await uploadBloom.add(idempotencyKey);

    await EventLog.create({
      aggregateId: document._id.toString(),
      eventType: 'DOCUMENT_UPLOADED',
      payload: { title: (document as any).title, type: fileType, size: file.size },
      userId,
    });

    logger.info('Upload: queuing document for AI processing', { raid, userId, meta: { documentId: document._id.toString() } });
    await documentQueue.add('process-document', { documentId: document._id.toString() });
    logger.info('Upload: upload complete', { raid, userId, meta: { documentId: document._id.toString(), filename: file.originalname } });

    return { document, duplicate: false };
  }

  /** Determines the document type from MIME and filename */
  resolveFileType(mimeType: string, filename: string): string {
    if (mimeType === 'application/pdf') return DocumentType.PDF;
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.pdf') return DocumentType.PDF;
    if (ext === '.md') return DocumentType.MARKDOWN;
    return DocumentType.TEXT;
  }

  /** Lists documents for a user with pagination and filtering */
  async getUserDocuments(userId: string, options: any = {}) {
    const { page = 1, limit = 20, status, type, search } = options;
    const query: any = { $or: [{ userId }, { sharedWith: userId }] };
    if (status) query.status = status;
    if (type) query.type = type;
    if (search) {
      query.$and = [{ $or: [{ title: { $regex: search, $options: 'i' } }] }];
    }

    const [documents, total] = await Promise.all([
      Document.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Document.countDocuments(query),
    ]);

    // Enrich with summary data
    const docIds = documents.map((d: any) => d._id);
    const summaries = await DocumentSummary.find({ documentId: { $in: docIds } }).lean();
    const summaryMap = new Map(summaries.map((s: any) => [s.documentId.toString(), s]));

    const enrichedDocs = documents.map((d: any) => {
      const doc = d.toObject();
      const summary = summaryMap.get(d._id.toString());
      return {
        ...doc,
        summary: summary?.summary || '',
        tags: summary?.tags || [],
        keyPoints: summary?.keyPoints || [],
      };
    });

    return {
      documents: enrichedDocs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /** Gets a single document by ID with access control */
  async getDocumentById(documentId: string, userId: string) {
    const doc = await Document.findOne({ _id: documentId, $or: [{ userId }, { sharedWith: userId }] });
    if (!doc) return null;

    const summary = await DocumentSummary.findOne({ documentId }).lean();
    const result = doc.toObject();
    return {
      ...result,
      summary: summary?.summary || '',
      tags: summary?.tags || [],
      keyPoints: summary?.keyPoints || [],
    };
  }

  /**
   * Gets document content with progressive loading.
   * Returns content in chunks — page-based pagination.
   */
  async getDocumentContentPaginated(documentId: string, page = 1, chunkSize = DEFAULT_CONTENT_CHUNK_SIZE) {
    const chunks = await DocumentContent.find({ documentId })
      .sort({ chunkIndex: 1 })
      .skip((page - 1) * chunkSize)
      .limit(chunkSize)
      .lean();

    const totalChunks = await DocumentContent.countDocuments({ documentId });
    const content = chunks.map((c: any) => c.content).join('');

    return {
      content,
      chunks: chunks.length,
      totalChunks,
      page,
      hasMore: (page * chunkSize) < totalChunks,
    };
  }

  /** Gets full document content (for S2S internal use) */
  async getDocumentContent(documentId: string) {
    const doc = await Document.findById(documentId).select('title type userId');
    if (!doc) return null;

    // Try chunked content first (DocumentContent collection)
    const chunks = await DocumentContent.find({ documentId }).sort({ chunkIndex: 1 }).lean();
    let content = chunks.map((c: any) => c.content).join('');

    // Fallback: read `content` field directly from the raw MongoDB document
    // (set by ai-server processor, not in this Mongoose schema)
    if (!content) {
      const raw = await Document.collection.findOne(
        { _id: doc._id },
        { projection: { content: 1 } }
      );
      content = (raw as any)?.content || '';
    }

    const summary = await DocumentSummary.findOne({ documentId }).lean();

    return {
      ...(doc.toObject()),
      content,
      summary: summary?.summary || '',
      tags: summary?.tags || [],
    };
  }

  /** Stores document content in chunks */
  async storeContentInChunks(documentId: string, fullContent: string): Promise<number> {
    const chunks: { documentId: string; chunkIndex: number; content: string; characterCount: number }[] = [];
    for (let i = 0; i < fullContent.length; i += CONTENT_CHUNK_CHARS) {
      const chunk = fullContent.substring(i, i + CONTENT_CHUNK_CHARS);
      chunks.push({
        documentId,
        chunkIndex: Math.floor(i / CONTENT_CHUNK_CHARS),
        content: chunk,
        characterCount: chunk.length,
      });
    }

    if (chunks.length > 0) {
      await DocumentContent.insertMany(chunks);
    }

    await Document.findByIdAndUpdate(documentId, { totalContentChunks: chunks.length });
    return chunks.length;
  }

  /** Stores the AI-generated summary and tags */
  async storeSummary(documentId: string, data: { summary?: string; keyPoints?: string[]; tags?: string[] }) {
    await DocumentSummary.findOneAndUpdate(
      { documentId },
      { $set: data },
      { upsert: true },
    );
  }

  /** Deletes a document and its associated data */
  async deleteDocument(documentId: string, userId: string, raid?: string) {
    const document = await Document.findOne({ _id: documentId, userId });
    if (!document) return null;

    logger.info('Delete: deleting document file from disk', { raid, userId, meta: { documentId, filePath: document.filePath } });
    try {
      if (fs.existsSync(document.filePath)) fs.unlinkSync(document.filePath);
    } catch (err: any) { /* ignore */ }

    logger.info('Delete: queuing vector cleanup', { raid, userId, meta: { documentId } });
    await vectorCleanupQueue.add('delete-vectors', { documentId });

    // Clean up split collections
    logger.info('Delete: cleaning content and summary collections', { raid, userId, meta: { documentId } });
    await Promise.all([
      DocumentContent.deleteMany({ documentId }),
      DocumentSummary.deleteOne({ documentId }),
    ]);

    logger.info('Delete: recording deletion event', { raid, userId, meta: { documentId } });
    await EventLog.create({
      aggregateId: documentId,
      eventType: 'DOCUMENT_DELETED',
      payload: { title: (document as any).title },
      userId,
    });

    await Document.findByIdAndDelete(documentId);
    logger.warn('Delete: document fully deleted', { raid, userId, meta: { documentId, title: (document as any).title } });
    return document;
  }

  /** Gets event sourcing log for a document */
  async getDocumentEvents(documentId: string) {
    return EventLog.find({ aggregateId: documentId }).sort({ createdAt: 1 }).lean();
  }

  /** Calculates total storage used by a user */
  async getUserStorageUsed(userId: string): Promise<number> {
    const result = await Document.aggregate([
      { $match: { userId: new (require('mongoose').Types.ObjectId)(userId) } },
      { $group: { _id: null, totalSize: { $sum: '$size' } } },
    ]);
    return result.length > 0 ? result[0].totalSize : 0;
  }

  /** Gets the file path for download with access control */
  async getDocumentFilePath(documentId: string, userId: string): Promise<string | null> {
    const doc = await Document.findOne({ _id: documentId, $or: [{ userId }, { sharedWith: userId }] }).select('filePath');
    if (!doc || !doc.filePath) return null;
    return doc.filePath;
  }
}

const documentService = new DocumentService();
export default documentService;
