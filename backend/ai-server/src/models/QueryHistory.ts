import mongoose from 'mongoose';

const queryHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', index: true },
    query: { type: String, required: true },
    answer: { type: String, default: '' },
    sourceDocuments: [{
      documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
      title: String,
      relevanceScore: Number,
      chunkText: String,
    }],
    responseTime: { type: Number, default: 0 },
    conversationId: { type: String, index: true },
    conversationTitle: { type: String, default: 'New Chat' },
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    feedback: {
      rating: { type: Number, min: 1, max: 5 },
      comment: String,
    },
  },
  { timestamps: true }
);

queryHistorySchema.index({ userId: 1, createdAt: -1 });
queryHistorySchema.index({ 'sharedWith': 1, conversationId: 1 });

const QueryHistory = mongoose.model('QueryHistory', queryHistorySchema);
export default QueryHistory;
