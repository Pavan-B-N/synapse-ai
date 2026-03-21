import axios from 'axios';
import Document from '../../models/Document';
import { ValidationError, NotFoundError } from '../errors';
import { broadcastToGateway } from '../changestream/ChangeStreamService';
import config from '../../config';
import logger from '../../Logger';

class DocumentShareHandler {
  async share(userId: string, documentId: string, targetUserId: string, isInternalCall: boolean, raid?: string) {
    if (!userId) throw new ValidationError('User context required');
    if (!targetUserId) throw new ValidationError('targetUserId is required');

    logger.info('DocShare.share: looking up document', { raid, userId, meta: { documentId, targetUserId, isInternalCall } });
    const doc = await Document.findOne({ _id: documentId });
    if (!doc) throw new NotFoundError('Document');

    if ((doc as any).userId.toString() === targetUserId) {
      throw new ValidationError('Cannot share a document with its owner');
    }
    if ((doc as any).userId.toString() !== userId && !isInternalCall) {
      throw new ValidationError('Only the document owner can share this document');
    }

    const already = ((doc as any).sharedWith || []).some((id: any) => id.toString() === targetUserId);
    if (already) throw new ValidationError('Document is already shared with this user');

    logger.info('DocShare.share: adding user to sharedWith list', { raid, userId, meta: { documentId, targetUserId } });
    (doc as any).sharedWith.push(targetUserId);
    await doc.save();
    logger.info('DocShare.share: sending notification to target user', { raid, userId, meta: { documentId, targetUserId } });

    // Persist notification via core-server (fire & forget)
    this.notifyUser(targetUserId, {
      type: 'document_shared',
      title: 'Document shared with you',
      message: `A document "${(doc as any).title}" has been shared with you`,
      metadata: { documentId: (doc as any)._id.toString(), sharedBy: userId },
    }, userId);

    // Real-time broadcast
    this.broadcastSafe(`user:${targetUserId}`, 'doc:shared', {
      documentId: (doc as any)._id.toString(),
      title: (doc as any).title,
      sharedBy: userId,
    });

    return { sharedWith: (doc as any).sharedWith };
  }

  async unshare(userId: string, documentId: string, targetUserId: string, raid?: string) {
    if (!userId) throw new ValidationError('User context required');

    logger.info('DocShare.unshare: looking up document', { raid, userId, meta: { documentId, targetUserId } });
    const doc = await Document.findOne({ _id: documentId, userId });
    if (!doc) throw new NotFoundError('Document');

    logger.info('DocShare.unshare: removing user from sharedWith list', { raid, userId, meta: { documentId, targetUserId } });
    (doc as any).sharedWith = ((doc as any).sharedWith || []).filter(
      (id: any) => id.toString() !== targetUserId,
    );
    await doc.save();

    // Persist notification
    this.notifyUser(targetUserId, {
      type: 'document_unshared',
      title: 'Document access revoked',
      message: `Your access to "${(doc as any).title}" has been removed`,
      metadata: { documentId: (doc as any)._id.toString(), revokedBy: userId },
    }, userId);

    // Real-time broadcast
    this.broadcastSafe(`user:${targetUserId}`, 'doc:unshared', {
      documentId: (doc as any)._id.toString(),
      title: (doc as any).title,
    });

    return { sharedWith: (doc as any).sharedWith };
  }

  private notifyUser(targetUserId: string, notification: any, actorUserId: string) {
    const gatewayUrl = process.env.API_GATEWAY_URL || 'http://localhost:5000';
    axios.post(`${gatewayUrl}/api/notifications`, {
      userId: targetUserId,
      ...notification,
    }, {
      headers: { 'x-service-auth': 'internal', 'x-user-id': actorUserId, 'x-user-name': 'System' },
      timeout: 5000,
    }).catch((err: any) => {
      console.warn('[document-server] Failed to persist notification:', err.message);
    });
  }

  private broadcastSafe(room: string, event: string, data: any) {
    try { broadcastToGateway(room, event, data); }
    catch (err: any) { console.warn(`[document-server] Failed to broadcast ${event}:`, err.message); }
  }
}

export default new DocumentShareHandler();
