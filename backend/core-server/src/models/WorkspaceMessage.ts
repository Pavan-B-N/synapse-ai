import mongoose from 'mongoose';

/**
 * WorkspaceMessage — separate collection for workspace chat (replaces embedded chatHistory).
 * Supports multi-user attribution for collaborative workspaces.
 */
const workspaceMessageSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocGroup', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, default: 'Unknown' },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

workspaceMessageSchema.index({ workspaceId: 1, createdAt: 1 });

const WorkspaceMessage = mongoose.model('WorkspaceMessage', workspaceMessageSchema);
export default WorkspaceMessage;
