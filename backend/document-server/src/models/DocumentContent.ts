import mongoose from 'mongoose';

/**
 * DocumentContent — Stores document text content in chunks.
 * Content is split into chunks for progressive loading instead of storing
 * everything in the main Document collection.
 */
const documentContentSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    chunkIndex: { type: Number, required: true },
    content: { type: String, required: true },
    characterCount: { type: Number, required: true },
  },
  { timestamps: true }
);

documentContentSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });

const DocumentContent = mongoose.model('DocumentContent', documentContentSchema);
export default DocumentContent;
