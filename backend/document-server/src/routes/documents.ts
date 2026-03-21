/**
 * DOCUMENT SERVER — Routes
 */

import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import config from '../config';
import { ValidationError, NotFoundError } from '../utils/errors';
import { AuthenticatedRequest } from '../middleware/serviceAuth';
import documentService from '../utils/document/DocumentService';
import documentShareHandler from '../utils/handler/DocumentShareHandler';
import { addSSEClient, removeSSEClient, broadcastToGateway } from '../utils/changestream/ChangeStreamService';
import { MAX_USER_STORAGE_BYTES, MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES, ALLOWED_FILE_EXTENSIONS } from '../constants';
import storageService from '../utils/storage/StorageService';
import logger from '../Logger';

const router = Router();

const fileFilter = (_req: any, file: any, cb: any) => {
  const allowed: readonly string[] = ALLOWED_MIME_TYPES;
  if (allowed.includes(file.mimetype) || file.originalname?.match(ALLOWED_FILE_EXTENSIONS)) {
    cb(null, true);
  } else {
    cb(new ValidationError(`File type not supported. Only PDF, Markdown (.md), and CSV files are allowed.`), false);
  }
};

const upload = multer({ storage: storageService.getStorageEngine(), fileFilter, limits: { fileSize: MAX_FILE_SIZE_BYTES } });

/**
 * POST /api/documents/upload — Upload a document (idempotent via content hash)
 *
 * Multer multipart form with a single `file` field.
 * Returns immediately — AI processing is async via BullMQ.
 *
 * @body {File} file - PDF, Markdown, or CSV file (max 50 MB)
 *
 * @response 201 { success, data: { document, duplicate: false } }
 * @response 200 { success, data: { document, duplicate: true } }
 */
router.post('/upload', upload.single('file'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new ValidationError('No file uploaded');

    const currentUsage = await documentService.getUserStorageUsed(req.user?.userId || '');
    if (currentUsage + req.file.size > MAX_USER_STORAGE_BYTES) {
      try { await storageService.deleteFile(req.file.path); } catch {}
      throw new ValidationError(`Storage limit exceeded. You are using ${(currentUsage / (1024 * 1024)).toFixed(1)} MB of ${(MAX_USER_STORAGE_BYTES / (1024 * 1024)).toFixed(0)} MB. Please delete some files first.`);
    }

    const result = await documentService.saveUpload(req.file, req.user?.userId || '', (req as any).raid);
    logger.info(result.duplicate ? 'Duplicate upload detected' : 'Document uploaded', {
      raid: (req as any).raid, userId: req.user?.userId,
      meta: { documentId: result.document._id, filename: req.file.originalname, duplicate: result.duplicate },
    });
    res.status(result.duplicate ? 200 : 201).json({ success: true, data: { document: result.document, duplicate: result.duplicate } });
  } catch (error) { next(error); }
});

/**
 * GET /api/documents/user/storage — Get user storage usage
 *
 * @response 200 { success, data: { used, limit, percentage } }
 */
router.get('/user/storage', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const used = await documentService.getUserStorageUsed(req.user?.userId || '');
    res.json({ success: true, data: { used, limit: MAX_USER_STORAGE_BYTES, percentage: Math.round((used / MAX_USER_STORAGE_BYTES) * 100) } });
  } catch (error) { next(error); }
});

/**
 * GET /api/documents — List user documents (paginated, filtered)
 *
 * @query {number} [page=1]   - Page number
 * @query {number} [limit=20] - Results per page
 * @query {string} [status]   - Filter by processing status
 * @query {string} [type]     - Filter by document type
 * @query {string} [search]   - Search by title
 *
 * @response 200 { success, data: { documents, total, page, limit } }
 */
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, status, type, search } = req.query;
    const result = await documentService.getUserDocuments(req.user?.userId || '', {
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 20,
      status, type, search,
    });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * GET /api/documents/:id — Get a single document
 *
 * @param {string} id - Document ID
 *
 * @response 200 { success, data: { document } }
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const document = await documentService.getDocumentById(req.params.id as string, req.user?.userId || '');
    if (!document) throw new NotFoundError('Document');
    res.json({ success: true, data: { document } });
  } catch (error) { next(error); }
});

/**
 * DELETE /api/documents/:id — Delete a document and notify shared users
 *
 * @param {string} id - Document ID
 *
 * @response 200 { success, message }
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const document = await documentService.deleteDocument(id, req.user?.userId || '', (req as any).raid);
    if (!document) throw new NotFoundError('Document');
    logger.info('Document deleted', { raid: (req as any).raid, userId: req.user?.userId, meta: { documentId: id } });

    for (const uid of ((document as any).sharedWith || [])) {
      try {
        broadcastToGateway(`user:${uid.toString()}`, 'doc:unshared', {
          documentId: id, title: (document as any).title, deleted: true,
        });
      } catch {}
    }

    res.json({ success: true, message: 'Document deleted' });
  } catch (error) { next(error); }
});

/**
 * GET /api/documents/:id/events — SSE stream for document processing
 *
 * Streams real-time document processing events via CDC change streams.
 * Sends INITIAL_STATE first, then incremental updates. Heartbeat every 30s.
 *
 * @param {string} id - Document ID
 *
 * @response SSE text/event-stream
 */
router.get('/:id/events', async (req: AuthenticatedRequest, res: Response) => {
  const docId = req.params.id as string;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const doc = await documentService.getDocumentById(docId, req.user?.userId || '');
  if (doc) {
    res.write(`data: ${JSON.stringify({
      type: 'INITIAL_STATE',
      status: (doc as any).status,
      embeddingStatus: (doc as any).embeddingStatus,
    })}\n\n`);
  }

  addSSEClient(docId, res);
  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeSSEClient(docId, res);
  });
});

/**
 * GET /api/documents/:id/history — Event sourcing log for a document
 *
 * @param {string} id - Document ID
 *
 * @response 200 { success, data: { events } }
 */
router.get('/:id/history', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const events = await documentService.getDocumentEvents(req.params.id as string);
    res.json({ success: true, data: { events } });
  } catch (error) { next(error); }
});

/**
 * GET /api/documents/:id/content — Internal S2S endpoint for document content
 *
 * Used by ai-server and core-server to fetch raw document content.
 *
 * @param {string} id - Document ID
 *
 * @response 200 { success, data: { document } }
 */
router.get('/:id/content', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const document = await documentService.getDocumentContent(req.params.id as string);
    if (!document) throw new NotFoundError('Document');
    res.json({ success: true, data: { document } });
  } catch (error) { next(error); }
});

/**
 * GET /api/documents/:id/content/paginated — Progressive content loading
 *
 * Returns document content in chunks for on-demand rendering.
 *
 * @param {string} id            - Document ID
 * @query {number} [page=1]      - Chunk page
 * @query {number} [chunkSize=5] - Chunks per page (max 20)
 *
 * @response 200 { success, data: { chunks, page, totalPages, hasMore } }
 */
router.get('/:id/content/paginated', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const page = Number(req.query.page) || 1;
    const chunkSize = Math.min(Number(req.query.chunkSize) || 5, 20);
    const result = await documentService.getDocumentContentPaginated(req.params.id as string, page, chunkSize);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * GET /api/documents/:id/download — Download the raw uploaded file
 *
 * @param {string} id - Document ID
 *
 * @response 200 Binary file stream
 */
router.get('/:id/download', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const filePath = await documentService.getDocumentFilePath(req.params.id as string, req.user?.userId || '');
    if (!filePath) throw new NotFoundError('Document');
    const fs = require('fs');
    if (!fs.existsSync(filePath)) throw new NotFoundError('File not found on disk');
    res.sendFile(filePath);
  } catch (error) { next(error); }
});

/**
 * POST /api/documents/:id/share — Share a document with another user
 *
 * Only the document owner can share (unless S2S internal call).
 * Sends a notification and real-time broadcast to the target user.
 *
 * @param  {string} id           - Document ID
 * @body   {string} targetUserId - User to share with
 *
 * @response 200 { success, data: { sharedWith } }
 */
router.post('/:id/share', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const isInternalCall = req.headers['x-internal-key'] === config.s2sToken.secret;
    const result = await documentShareHandler.share(
      req.user?.userId || '', req.params.id as string, req.body.targetUserId, isInternalCall, (req as any).raid,
    );
    logger.info('Document shared', { raid: (req as any).raid, userId: req.user?.userId, meta: { documentId: req.params.id, targetUserId: req.body.targetUserId } });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * DELETE /api/documents/:id/share/:targetUserId — Revoke document sharing
 *
 * Removes the target user from the sharedWith list and notifies them.
 *
 * @param {string} id           - Document ID
 * @param {string} targetUserId - User to revoke access from
 *
 * @response 200 { success, data: { sharedWith } }
 */
router.delete('/:id/share/:targetUserId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await documentShareHandler.unshare(
      req.user?.userId || '', req.params.id as string, req.params.targetUserId as string, (req as any).raid,
    );
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

export default router;
