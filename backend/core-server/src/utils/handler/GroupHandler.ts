import DocGroup from '../../models/DocGroup';
import WorkspaceMessage from '../../models/WorkspaceMessage';
import { aiClient } from '../client/AIClient';
import { documentClient } from '../client/DocumentClient';
import { publisher } from '../publisher';
import { broadcaster } from '../broadcast';
import { NotFoundError, ValidationError } from '../errors';
import logger from '../../Logger';

// ── Access helpers ──

function hasAccess(group: any, userId: string): boolean {
  if (group.userId.toString() === userId) return true;
  return (group.members || []).some((m: any) => m.userId.toString() === userId);
}

function canEdit(group: any, userId: string): boolean {
  if (group.userId.toString() === userId) return true;
  const member = (group.members || []).find((m: any) => m.userId.toString() === userId);
  return member?.role === 'editor';
}

function canChat(group: any, userId: string): boolean {
  if (group.userId.toString() === userId) return true;
  const member = (group.members || []).find((m: any) => m.userId.toString() === userId);
  return member?.role === 'editor' || member?.role === 'viewer';
}

function getUserRole(group: any, userId: string): string {
  if (group.userId.toString() === userId) return 'owner';
  const member = (group.members || []).find((m: any) => m.userId.toString() === userId);
  return member?.role || 'readonly';
}

async function enrichDocuments(docIds: any[], userId: string, raid?: string) {
  const documents: Array<{ _id: string; title: string; type: string }> = [];
  for (const docId of docIds) {
    try {
      const doc = await documentClient.getDocumentContent(docId.toString(), userId, raid);
      documents.push({ _id: docId.toString(), title: doc.title, type: (doc as any).type || 'text' });
    } catch {
      documents.push({ _id: docId.toString(), title: 'Document', type: 'text' });
    }
  }
  return documents;
}

class GroupHandler {
  async create(userId: string, userName: string, userEmail: string, body: any, raid?: string) {
    if (!userId) throw new ValidationError('User context required');
    const { name, description, documentIds } = body;
    if (!name?.trim()) throw new ValidationError('Group name is required');

    const docIds: string[] = documentIds || [];
    logger.info('Workspace.create: enriching documents', { raid, userId, meta: { docCount: docIds.length } });
    const documents = await enrichDocuments(docIds, userId, raid);

    logger.info('Workspace.create: creating workspace record', { raid, userId, meta: { name: name.trim() } });
    const group = await DocGroup.create({
      userId, name: name.trim(), description: description || '', documentIds: docIds,
      visibility: 'private',
      members: [{ userId, userName, userEmail, role: 'owner' }],
    });
    logger.info('Workspace.create: workspace created', { raid, userId, meta: { workspaceId: group._id.toString() } });

    return { ...group.toObject(), documents, messageCount: 0 };
  }

  async list(userId: string, raid?: string) {
    if (!userId) throw new ValidationError('User context required');

    const groups = await DocGroup.find({
      $or: [{ userId }, { 'members.userId': userId }],
    }).sort({ updatedAt: -1 }).lean();

    return Promise.all(groups.map(async (g: any) => {
      const documents = await enrichDocuments(g.documentIds || [], userId, raid);
      const messageCount = await WorkspaceMessage.countDocuments({ workspaceId: g._id });
      return {
        ...g, documents, messageCount,
        isOwner: g.userId.toString() === userId,
        userRole: getUserRole(g, userId),
        memberCount: (g.members || []).length,
      };
    }));
  }

  async getById(userId: string, groupId: string, raid?: string) {
    if (!userId) throw new ValidationError('User context required');

    const group = await DocGroup.findById(groupId).lean();
    if (!group) throw new NotFoundError('Group not found');
    if (!hasAccess(group, userId)) throw new NotFoundError('Group not found');

    const documents = await enrichDocuments((group as any).documentIds || [], userId, raid);

    const messages = await WorkspaceMessage.find({ workspaceId: group._id })
      .sort({ createdAt: 1 }).limit(100).lean();
    const chatHistory = messages.length > 0 ? messages : ((group as any).chatHistory || []);

    return {
      ...group, documents, chatHistory,
      messageCount: chatHistory.length,
      isOwner: (group as any).userId.toString() === userId,
      userRole: getUserRole(group, userId),
      members: (group as any).members || [],
    };
  }

  async update(userId: string, userName: string, groupId: string, body: any, raid?: string) {
    if (!userId) throw new ValidationError('User context required');

    const group = await DocGroup.findById(groupId);
    if (!group) throw new NotFoundError('Group not found');
    if (!canEdit(group, userId)) throw new ValidationError('Insufficient permissions');

    const { name, description, documentIds } = body;
    const oldDocIds = new Set(group.documentIds.map((id: any) => id.toString()));

    if (name !== undefined) group.name = name.trim();
    if (description !== undefined) group.description = description;
    if (documentIds !== undefined) group.documentIds = documentIds;
    await group.save();

    if (documentIds !== undefined) {
      const newDocIds = new Set((documentIds as string[]).map(String));
      const added = [...newDocIds].filter(id => !oldDocIds.has(id));
      const removed = [...oldDocIds].filter(id => !newDocIds.has(id));

      if (added.length > 0 || removed.length > 0) {
        const documents = await enrichDocuments(group.documentIds, userId, raid);
        broadcaster.emit(`workspace:${group._id}`, 'workspace:documents', {
          workspaceId: group._id.toString(), documents, addedIds: added, removedIds: removed,
        });

        if (added.length > 0) {
          await this.autoShareDocuments(group, userId, userName, added, raid);
        }
      }
    }

    return group;
  }

  async removeDocumentFromAll(userId: string, docId: string) {
    if (!userId) throw new ValidationError('User context required');
    const result = await DocGroup.updateMany({ userId }, { $pull: { documentIds: docId } as any });
    return result.modifiedCount;
  }

  async deleteGroup(userId: string, groupId: string) {
    if (!userId) throw new ValidationError('User context required');
    const group = await DocGroup.findOne({ _id: groupId, userId });
    if (!group) throw new NotFoundError('Group not found');

    logger.info('Workspace.delete: deleting workspace messages', { userId, meta: { workspaceId: groupId } });
    await WorkspaceMessage.deleteMany({ workspaceId: group._id });
    await group.deleteOne();
    logger.warn('Workspace.delete: workspace deleted', { userId, meta: { workspaceId: groupId, name: group.name } });
  }

  async addDocuments(userId: string, groupId: string, documentIds: string[]) {
    if (!userId) throw new ValidationError('User context required');

    const group = await DocGroup.findById(groupId);
    if (!group) throw new NotFoundError('Group not found');
    if (!canEdit(group, userId)) throw new ValidationError('Insufficient permissions');
    if (!Array.isArray(documentIds)) throw new ValidationError('documentIds must be an array');

    const existing = new Set(group.documentIds.map((id: any) => id.toString()));
    const newIds = documentIds.filter((id: string) => !existing.has(id));
    group.documentIds.push(...newIds as any);
    await group.save();

    return group;
  }

  async share(userId: string, groupId: string, body: any, raid?: string) {
    if (!userId) throw new ValidationError('User context required');

    logger.info('Workspace.share: looking up workspace', { raid, userId, meta: { workspaceId: groupId } });
    const group = await DocGroup.findOne({ _id: groupId, userId });
    if (!group) throw new NotFoundError('Group not found');

    const { targetUserId, role = 'viewer', targetUserName = '', targetUserEmail = '' } = body;
    if (!targetUserId) throw new ValidationError('targetUserId is required');
    if (!['editor', 'viewer', 'readonly'].includes(role)) throw new ValidationError('role must be editor, viewer, or readonly');
    if (targetUserId === userId) throw new ValidationError('Cannot share with yourself');

    const existingMember = (group.members as any[]).find((m: any) => m.userId.toString() === targetUserId);
    if (existingMember) {
      logger.info('Workspace.share: updating existing member role', { raid, userId, meta: { targetUserId, oldRole: existingMember.role, newRole: role } });
      existingMember.role = role;
      if (targetUserName) existingMember.userName = targetUserName;
      if (targetUserEmail) existingMember.userEmail = targetUserEmail;
    } else {
      logger.info('Workspace.share: adding new member', { raid, userId, meta: { targetUserId, role } });
      (group.members as any[]).push({ userId: targetUserId, userName: targetUserName, userEmail: targetUserEmail, role, addedAt: new Date() });
    }
    group.visibility = 'shared';
    await group.save();

    // Auto-share workspace documents
    logger.info('Workspace.share: auto-sharing documents with new member', { raid, userId, meta: { targetUserId, docCount: group.documentIds.length } });
    for (const docId of group.documentIds) {
      try { await documentClient.shareDocument(docId.toString(), userId, targetUserId, raid); }
      catch (err: any) { logger.warn('Workspace.share: failed to auto-share doc', { raid, userId, meta: { docId: docId.toString(), targetUserId, error: err.message } }); }
    }

    // Notify target user
    this.publishNotification(targetUserId, 'workspace_shared',
      'Workspace shared with you',
      `You have been added to workspace "${group.name}" as ${role}`,
      { workspaceId: group._id.toString(), role, sharedBy: userId },
    );

    broadcaster.emit(`user:${targetUserId}`, 'workspace:shared', {
      workspaceId: group._id.toString(), name: group.name, role, sharedBy: userId,
    });

    logger.info('Workspace.share: share complete', { raid, userId, meta: { workspaceId: groupId, targetUserId, role } });
    return { members: group.members, visibility: group.visibility };
  }

  async updateMemberRole(userId: string, groupId: string, memberId: string, role: string) {
    if (!userId) throw new ValidationError('User context required');

    const group = await DocGroup.findOne({ _id: groupId, userId });
    if (!group) throw new NotFoundError('Group not found');

    if (!['editor', 'viewer', 'readonly'].includes(role)) throw new ValidationError('role must be editor, viewer, or readonly');
    if (memberId === userId) throw new ValidationError('Cannot change your own role');

    const member = (group.members as any[]).find((m: any) => m.userId.toString() === memberId);
    if (!member) throw new NotFoundError('Member not found');
    if (member.role === 'owner') throw new ValidationError('Cannot change owner role');

    member.role = role;
    await group.save();

    return { members: group.members };
  }

  async removeMember(userId: string, groupId: string, memberId: string) {
    if (!userId) throw new ValidationError('User context required');

    const group = await DocGroup.findOne({ _id: groupId, userId });
    if (!group) throw new NotFoundError('Group not found');
    if (memberId === userId) throw new ValidationError('Cannot remove yourself');

    const removedMember = (group.members as any[]).find((m: any) => m.userId.toString() === memberId);

    (group.members as any) = (group.members as any[]).filter((m: any) => m.userId.toString() !== memberId);
    const nonOwnerMembers = (group.members as any[]).filter((m: any) => m.userId.toString() !== userId);
    if (nonOwnerMembers.length === 0) group.visibility = 'private';
    await group.save();

    if (removedMember) {
      this.publishNotification(memberId, 'workspace_removed',
        'Removed from workspace',
        `You have been removed from workspace "${group.name}"`,
        { workspaceId: group._id.toString(), removedBy: userId },
      );
      broadcaster.emit(`user:${memberId}`, 'workspace:removed', {
        workspaceId: group._id.toString(), name: group.name,
      });
    }

    return { members: group.members, visibility: group.visibility };
  }

  async chat(userId: string, userName: string, groupId: string, message: string, raid?: string) {
    if (!userId) throw new ValidationError('User context required');
    if (!message?.trim()) throw new ValidationError('Message is required');

    logger.info('Workspace.chat: looking up workspace', { raid, userId, meta: { workspaceId: groupId } });
    const group = await DocGroup.findById(groupId);
    if (!group) throw new NotFoundError('Group not found');
    if (!hasAccess(group, userId)) throw new NotFoundError('Group not found');
    if (!canChat(group, userId)) throw new ValidationError('You do not have permission to chat in this workspace. Readonly members cannot send messages.');

    // Save user message
    logger.info('Workspace.chat: saving user message', { raid, userId, meta: { workspaceId: groupId } });
    const userMsg = await WorkspaceMessage.create({
      workspaceId: group._id, userId, userName, role: 'user', content: message.trim(),
    });

    broadcaster.emit(`workspace:${group._id}`, 'workspace:message', {
      _id: userMsg._id, workspaceId: group._id.toString(), userId, userName,
      role: 'user', content: message.trim(), createdAt: userMsg.createdAt,
    });

    // Typing indicator
    broadcaster.emit(`workspace:${group._id}`, 'workspace:typing', {
      workspaceId: group._id.toString(), userId, userName, isTyping: true,
    });

    // Build AI context
    logger.info('Workspace.chat: fetching document context', { raid, userId, meta: { workspaceId: groupId, docCount: Math.min(group.documentIds.length, 5) } });
    const contentChunks: string[] = [];
    for (const docId of group.documentIds.slice(0, 5)) {
      try {
        const doc = await documentClient.getDocumentContent(docId.toString(), userId, raid);
        contentChunks.push(`[${doc.title}]: ${doc.content.substring(0, 2000)}`);
        logger.debug('Workspace.chat: fetched doc content', { raid, userId, meta: { docId: docId.toString(), title: doc.title, contentLen: doc.content.length } });
      } catch { /* skip unavailable docs */ }
    }

    logger.info('Workspace.chat: fetching recent conversation history', { raid, userId, meta: { workspaceId: groupId } });
    const recentMessages = await WorkspaceMessage.find({ workspaceId: group._id })
      .sort({ createdAt: -1 }).limit(10).lean();
    const recentHistory = recentMessages.reverse()
      .map((m: any) => `${m.userName} (${m.role}): ${m.content}`).join('\n');

    const contextStr = contentChunks.join('\n\n');
    const prompt = `Context from user's documents:\n${contextStr}\n\nRecent conversation:\n${recentHistory}\n\nUser: ${message}`;
    logger.info('Workspace.chat: calling AI service for response', { raid, userId, meta: { workspaceId: groupId, contextChunks: contentChunks.length, historyMessages: recentMessages.length } });
    const response = await aiClient.generateText(
      prompt, 'You are a helpful document analysis assistant. Answer based on the provided document context.',
      undefined, raid,
    );
    logger.info('Workspace.chat: AI response received', { raid, userId, meta: { workspaceId: groupId, responseLen: response.length } });

    // Save AI response
    const aiMsg = await WorkspaceMessage.create({
      workspaceId: group._id, userId, userName: 'AI Assistant', role: 'assistant', content: response,
    });

    broadcaster.emit(`workspace:${group._id}`, 'workspace:message', {
      _id: aiMsg._id, workspaceId: group._id.toString(), userId,
      userName: 'AI Assistant', role: 'assistant', content: response, createdAt: aiMsg.createdAt,
    });

    broadcaster.emit(`workspace:${group._id}`, 'workspace:typing', {
      workspaceId: group._id.toString(), userId, userName, isTyping: false,
    });

    const latestMessages = await WorkspaceMessage.find({ workspaceId: group._id })
      .sort({ createdAt: 1 }).limit(100).lean();

    logger.info('Workspace.chat: chat complete', { raid, userId, meta: { workspaceId: groupId } });
    return { reply: response, chatHistory: latestMessages };
  }

  async getMessages(userId: string, groupId: string, page: number, limit: number) {
    if (!userId) throw new ValidationError('User context required');

    const group = await DocGroup.findById(groupId).lean();
    if (!group) throw new NotFoundError('Group not found');
    if (!hasAccess(group, userId)) throw new NotFoundError('Group not found');

    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
      WorkspaceMessage.find({ workspaceId: group._id })
        .sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
      WorkspaceMessage.countDocuments({ workspaceId: group._id }),
    ]);

    return { messages, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ── Private helpers ──

  private async autoShareDocuments(group: any, userId: string, userName: string, addedDocIds: string[], raid?: string) {
    const otherMembers = (group.members || []).filter((m: any) => m.userId.toString() !== userId);
    for (const docId of addedDocIds) {
      for (const member of otherMembers) {
        try { await documentClient.shareDocument(docId, userId, member.userId.toString(), raid); }
        catch (err: any) { console.warn(`[core-server] Auto-share doc ${docId} with ${member.userId}:`, err.message); }
      }
    }
    for (const member of otherMembers) {
      this.publishNotification(member.userId.toString(), 'document_shared',
        'New documents in workspace',
        `${userName} added ${addedDocIds.length} document(s) to workspace "${group.name}"`,
        { workspaceId: group._id.toString(), addedBy: userId, documentIds: addedDocIds },
      );
    }
  }

  private publishNotification(userId: string, type: string, title: string, messageText: string, metadata: any) {
    publisher.publish('notifications', { userId, type, title, messageText, metadata },
      `notification.${type}`,
    ).catch((err: any) => console.warn(`[core-server] Failed to publish ${type} notification:`, err.message));
  }
}

export default new GroupHandler();
