import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'workspace_shared', 'workspace_updated', 'workspace_removed',
        'document_ready', 'document_error',
        'document_shared', 'document_unshared',
        'chat_shared', 'chat_unshared',
        'member_joined',
        'channel_invite', 'channel_join_request', 'channel_join_approved', 'channel_join_rejected', 'channel_post',
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
