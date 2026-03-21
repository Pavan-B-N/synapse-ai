import mongoose from 'mongoose';
import { CHANNEL_CATEGORIES } from '../constants';

const memberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, default: '' },
  userEmail: { type: String, default: '' },
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const joinRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, default: '' },
  userEmail: { type: String, default: '' },
  requestedAt: { type: Date, default: Date.now },
}, { _id: false });

const channelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 500 },
    profileImage: { type: String, default: '' },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [memberSchema],
    joinRequests: [joinRequestSchema],
    tags: [{ type: String, trim: true, lowercase: true }],
    categories: [{ type: String, trim: true }],
    attachedWorkspaces: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DocGroup' }],
    memberCount: { type: Number, default: 1 },
    postCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

channelSchema.index({ name: 'text', description: 'text', tags: 'text' });
channelSchema.index({ adminId: 1 });
channelSchema.index({ 'members.userId': 1 });
channelSchema.index({ memberCount: -1 });
channelSchema.index({ categories: 1 });

const Channel = mongoose.model('Channel', channelSchema);
export default Channel;
