/**
 * DocumentSummary model (ai-server) — writes to the same `documentsummaries`
 * collection that document-server reads. Used by documentProcessor to store
 * AI-generated summaries, tags, and key points.
 */
import mongoose from 'mongoose';

const documentSummarySchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    summary: { type: String, default: '' },
    keyPoints: [{ type: String }],
    tags: [{ type: String }],
  },
  { timestamps: true }
);

const DocumentSummary = mongoose.model('DocumentSummary', documentSummarySchema);
export default DocumentSummary;
