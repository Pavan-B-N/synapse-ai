import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, default: '' },
  userEmail: { type: String, default: '' },
  role: { type: String, enum: ['owner', 'editor', 'viewer', 'readonly'], default: 'viewer' },
  addedAt: { type: Date, default: Date.now },
}, { _id: false });

const docGroupSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    documentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
    visibility: { type: String, enum: ['private', 'shared'], default: 'private' },
    members: [memberSchema],
    // Legacy — kept for backward compatibility; new messages go to WorkspaceMessage collection
    chatHistory: [{
      role: { type: String, enum: ['user', 'assistant'] },
      content: { type: String },
      createdAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

docGroupSchema.index({ userId: 1, createdAt: -1 });
docGroupSchema.index({ 'members.userId': 1 });

const DocGroup = mongoose.model('DocGroup', docGroupSchema);
export default DocGroup;
