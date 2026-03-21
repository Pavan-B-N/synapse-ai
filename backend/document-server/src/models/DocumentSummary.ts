import mongoose from 'mongoose';

/**
 * DocumentSummary — Stores AI-generated summaries and insights for a document.
 * Kept separate from the main Document model to keep it lightweight.
 */
const documentSummarySchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, unique: true },
    summary: { type: String, default: '' },
    keyPoints: [{ type: String }],
    tags: [{ type: String, lowercase: true }],
  },
  { timestamps: true }
);

documentSummarySchema.index({ documentId: 1 });

const DocumentSummary = mongoose.model('DocumentSummary', documentSummarySchema);
export default DocumentSummary;
