import mongoose from 'mongoose';

/**
 * Event Log — Event sourcing for document lifecycle.
 * Every state change is recorded as an immutable event.
 */
const eventLogSchema = new mongoose.Schema(
  {
    aggregateId: { type: String, required: true, index: true }, // documentId
    aggregateType: { type: String, default: 'Document' },
    eventType: {
      type: String,
      required: true,
      enum: [
        'DOCUMENT_UPLOADED',
        'DOCUMENT_PROCESSING_STARTED',
        'DOCUMENT_PROCESSED',
        'DOCUMENT_PROCESSING_FAILED',
        'DOCUMENT_DELETED',
        'DOCUMENT_EMBEDDING_COMPLETE',
        'DOCUMENT_CONTENT_EXTRACTED',
      ],
    },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    userId: { type: String, index: true },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

eventLogSchema.index({ aggregateId: 1, version: 1 });
eventLogSchema.index({ eventType: 1, createdAt: -1 });

const EventLog = mongoose.model('EventLog', eventLogSchema);
export default EventLog;
