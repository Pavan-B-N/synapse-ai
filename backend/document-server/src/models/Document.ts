import mongoose from 'mongoose';
import { DocumentType, DocumentStatus, EmbeddingStatus } from '../constants';

/**
 * Document — Lightweight metadata model for uploaded documents.
 * Content and summaries are stored in separate collections (DocumentContent, DocumentSummary)
 * to keep this model concise and enable progressive/on-demand loading.
 */
const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    filePath: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: Object.values(DocumentStatus),
      default: DocumentStatus.UPLOADING,
    },
    type: {
      type: String,
      enum: Object.values(DocumentType),
      required: true,
    },
    chunkCount: { type: Number, default: 0 },
    totalContentChunks: { type: Number, default: 0 },
    embeddingStatus: {
      type: String,
      enum: Object.values(EmbeddingStatus),
      default: EmbeddingStatus.PENDING,
    },
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    idempotencyKey: { type: String, unique: true, sparse: true },
    metadata: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

documentSchema.index({ userId: 1, status: 1 });
documentSchema.index({ 'sharedWith': 1 });
documentSchema.index({ createdAt: -1 });
documentSchema.index({ title: 'text' });

const Document = mongoose.model('Document', documentSchema);
export default Document;
