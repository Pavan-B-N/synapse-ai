import mongoose from 'mongoose';

/** Supported document types */
enum DocumentType {
  PDF = 'pdf',
  TEXT = 'text',
  MARKDOWN = 'markdown',
}

/** Document processing status */
enum DocumentStatus {
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  READY = 'ready',
  ERROR = 'error',
}

/**
 * Document — AI-server mirror of the document metadata model.
 * Content and summaries are stored in separate collections on document-server.
 */
const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    filePath: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: Object.values(DocumentStatus), default: DocumentStatus.UPLOADING },
    type: { type: String, enum: Object.values(DocumentType), required: true },
    content: { type: String, default: '' },
    summary: { type: String, default: '' },
    keyPoints: [{ type: String }],
    tags: [{ type: String, lowercase: true }],
    chunkCount: { type: Number, default: 0 },
    embeddingStatus: { type: String, enum: ['pending', 'processing', 'complete', 'error'], default: 'pending' },
    idempotencyKey: { type: String, unique: true, sparse: true },
    metadata: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

documentSchema.index({ userId: 1, status: 1 });
documentSchema.index({ tags: 1 });
documentSchema.index({ title: 'text', content: 'text' });

const Document = mongoose.model('Document', documentSchema);
export default Document;
