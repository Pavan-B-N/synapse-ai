import mongoose from 'mongoose';
import axios from 'axios';
import QueryHistory from '../../models/QueryHistory';
import { broadcastToUser } from '../broadcast/GatewayBroadcaster';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';

const GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:5000';

class ConversationHandler {
  async listConversations(userId: string) {
    const uid = new mongoose.Types.ObjectId(userId);
    const [owned, shared] = await Promise.all([
      QueryHistory.aggregate([
        { $match: { userId: uid, documentId: null } },
        { $sort: { createdAt: -1 } },
        { $group: {
          _id: '$conversationId',
          title: { $first: '$conversationTitle' },
          lastMessageAt: { $first: '$createdAt' },
          sharedWith: { $first: '$sharedWith' },
        } },
        { $sort: { lastMessageAt: -1 } },
      ]),
      QueryHistory.aggregate([
        { $match: { sharedWith: uid, documentId: null } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$conversationId', title: { $first: '$conversationTitle' }, lastMessageAt: { $first: '$createdAt' }, ownerId: { $first: '$userId' } } },
        { $sort: { lastMessageAt: -1 } },
      ]),
    ]);
    return { owned, shared };
  }

  async shareConversation(userId: string, conversationId: string, targetUserId: string) {
    if (!targetUserId) throw new ValidationError('targetUserId required');
    if (targetUserId === userId) throw new ValidationError('Cannot share with yourself');

    const ownerCheck = await QueryHistory.findOne({ conversationId, userId });
    if (!ownerCheck) throw new ForbiddenError('Only the conversation owner can share');

    const alreadyShared = (ownerCheck.sharedWith || []).some((id: any) => id.toString() === targetUserId);
    if (alreadyShared) throw new ValidationError('Already shared with this user');

    await QueryHistory.updateMany(
      { conversationId, userId },
      { $addToSet: { sharedWith: targetUserId } },
    );

    this.notifyUser(targetUserId, userId, 'chat_shared', 'Chat shared with you', 'An AI conversation has been shared with you', { conversationId, sharedBy: userId });
    this.broadcastSafe(targetUserId, 'chat:shared', { conversationId, sharedBy: userId });
  }

  async unshareConversation(userId: string, conversationId: string, targetUserId: string) {
    await QueryHistory.updateMany(
      { conversationId, userId },
      { $pull: { sharedWith: new mongoose.Types.ObjectId(targetUserId) } as any },
    );

    this.notifyUser(targetUserId, userId, 'chat_unshared', 'Chat access revoked', 'Your access to a shared AI conversation has been removed', { conversationId, revokedBy: userId });
    this.broadcastSafe(targetUserId, 'chat:unshared', { conversationId, revokedBy: userId });
  }

  async getSharedUsers(userId: string, conversationId: string) {
    const entry = await QueryHistory.findOne({ conversationId, userId });
    if (!entry) throw new NotFoundError('Conversation');
    return { sharedWith: (entry.sharedWith || []).map((id: any) => id.toString()) };
  }

  async getConversationHistory(userId: string, conversationId: string) {
    const queries = await QueryHistory.find({
      conversationId,
      $or: [{ userId: userId }, { sharedWith: userId }],
    }).sort({ createdAt: 1 });

    if (queries.length === 0) {
      const exists = await QueryHistory.findOne({ conversationId });
      if (exists) throw new ForbiddenError('Access to this conversation has been revoked.');
    }

    return { queries };
  }

  async deleteConversation(userId: string, conversationId: string) {
    const entry = await QueryHistory.findOne({ conversationId });
    if (!entry) throw new NotFoundError('Conversation');
    if ((entry as any).userId?.toString() !== userId) throw new ForbiddenError('Only the owner can delete this conversation');

    await QueryHistory.deleteMany({ conversationId });
  }

  async getHistory(userId: string, page: number = 1, limit: number = 20) {
    const queries = await QueryHistory.find({ userId }).sort({ createdAt: -1 })
      .skip((page - 1) * limit).limit(limit);
    const total = await QueryHistory.countDocuments({ userId });
    return { queries, pagination: { page, limit, total } };
  }

  async getDocumentHistory(userId: string, documentId: string, page: number = 1, limit: number = 50) {
    const queries = await QueryHistory.find({ userId, documentId })
      .sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit);
    return { queries };
  }

  private notifyUser(targetUserId: string, senderUserId: string, type: string, title: string, message: string, metadata: Record<string, any>) {
    axios.post(`${GATEWAY_URL}/api/notifications`, {
      userId: targetUserId, type, title, message, metadata,
    }, {
      headers: { 'x-service-auth': 'internal', 'x-user-id': senderUserId, 'x-user-name': 'System' },
      timeout: 5000,
    }).catch((err: any) => console.warn(`[ai-server] Failed to persist ${type} notification:`, err.message));
  }

  private broadcastSafe(targetUserId: string, event: string, data: Record<string, any>) {
    try { broadcastToUser(targetUserId, event, data); }
    catch (err: any) { console.warn(`[ai-server] Failed to broadcast ${event}:`, err.message); }
  }
}

export default new ConversationHandler();
