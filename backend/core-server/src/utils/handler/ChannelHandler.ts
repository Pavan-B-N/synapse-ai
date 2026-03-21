import Channel from '../../models/Channel';
import ChannelPost from '../../models/ChannelPost';
import Notification from '../../models/Notification';
import { CHANNEL_CATEGORIES } from '../../constants';
import { aiClient } from '../client/AIClient';
import { publisher } from '../publisher';
import { broadcaster } from '../broadcast';
import { NotFoundError, ValidationError } from '../errors';
import logger from '../../Logger';

// ── Helpers ──

function isAdmin(channel: any, userId: string): boolean {
  return channel.adminId.toString() === userId ||
    (channel.members || []).some((m: any) => m.userId.toString() === userId && (m.role === 'owner' || m.role === 'admin'));
}

function isOwner(channel: any, userId: string): boolean {
  return channel.adminId.toString() === userId ||
    (channel.members || []).some((m: any) => m.userId.toString() === userId && m.role === 'owner');
}

function isMember(channel: any, userId: string): boolean {
  return (channel.members || []).some((m: any) => m.userId.toString() === userId);
}

export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const match = url.match(p);
    if (match) return match[1];
  }
  return null;
}

export async function moderateContent(text: string, raid?: string): Promise<{ safe: boolean; reason?: string }> {
  try {
    logger.info('ContentModeration: invoking AI moderation', { raid, meta: { textLen: text.length } });
    const prompt = `You are a content moderation AI. Analyze the following content for a student study channel platform. The content should be educational and appropriate.

Check for:
1. Sexual or explicit content
2. Hate speech or discrimination
3. Violence or graphic content
4. Spam or scam content
5. Content completely unrelated to education/studying

Content to analyze:
"""
${text.substring(0, 3000)}
"""

Respond with ONLY a JSON object (no markdown, no code blocks):
{"safe": true} if the content is appropriate for a study platform
{"safe": false, "reason": "brief explanation"} if not appropriate`;

    const result = await aiClient.generateText(prompt, 'You are a strict content moderation system. Respond with only valid JSON.', undefined, raid);
    const cleaned = result.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    logger.info('ContentModeration: moderation result', { raid, meta: { safe: parsed.safe !== false, reason: parsed.reason } });
    return { safe: parsed.safe !== false, reason: parsed.reason };
  } catch {
    logger.warn('ContentModeration: moderation failed, defaulting to safe', { raid });
    return { safe: true };
  }
}

class ChannelHandler {
  async create(userId: string, userName: string, userEmail: string, body: any, raid?: string) {
    if (!userId) throw new ValidationError('User context required');
    const { name, description, tags, profileImage, categories } = body;
    if (!name?.trim()) throw new ValidationError('Channel name is required');

    logger.info('Channel.create: creating channel', { raid, userId, meta: { name: name.trim(), tags, categories } });
    const channel = await Channel.create({
      name: name.trim(),
      description: description || '',
      profileImage: profileImage || '',
      adminId: userId,
      tags: Array.isArray(tags) ? tags.map((t: string) => t.trim().toLowerCase()).slice(0, 10) : [],
      categories: Array.isArray(categories) ? categories.filter((c: string) => CHANNEL_CATEGORIES.includes(c as any)).slice(0, 10) : [],
      members: [{ userId, userName, userEmail, role: 'owner' }],
      memberCount: 1,
    });
    logger.info('Channel.create: channel created', { raid, userId, meta: { channelId: channel._id.toString() } });

    return channel;
  }

  async list(userId: string, search: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const filter: any = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    const [channels, total] = await Promise.all([
      Channel.find(filter).sort({ memberCount: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Channel.countDocuments(filter),
    ]);

    const enriched = channels.map((ch: any) => ({
      ...ch,
      isAdmin: ch.adminId.toString() === userId,
      isMember: (ch.members || []).some((m: any) => m.userId.toString() === userId),
      hasPendingRequest: (ch.joinRequests || []).some((r: any) => r.userId.toString() === userId),
    }));

    return { channels: enriched, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getRecommended(userId: string, limit: number, skip: number) {
    if (!userId) throw new ValidationError('User context required');

    const mongoose = require('mongoose');
    let userPreferredCategories: string[] = [];
    try {
      const userDoc = await mongoose.connection.db.collection('users').findOne(
        { _id: new mongoose.Types.ObjectId(userId) },
        { projection: { 'preferences.channelCategories': 1 } },
      );
      userPreferredCategories = userDoc?.preferences?.channelCategories || [];
    } catch { /* ignore */ }

    const userChannels = await Channel.find({ 'members.userId': userId }).select('_id tags categories').lean();
    const userChannelIds = userChannels.map((c: any) => c._id);
    const userTags = [...new Set(userChannels.flatMap((c: any) => c.tags || []))];
    const userCategories = [...new Set([
      ...userPreferredCategories,
      ...userChannels.flatMap((c: any) => c.categories || []),
    ])];

    const matchConditions: any[] = [];
    if (userTags.length > 0) matchConditions.push({ tags: { $in: userTags } });
    if (userCategories.length > 0) matchConditions.push({ categories: { $in: userCategories } });

    let recommended;
    if (matchConditions.length > 0) {
      recommended = await Channel.find({ _id: { $nin: userChannelIds }, $or: matchConditions })
        .sort({ memberCount: -1, createdAt: -1 }).skip(skip).limit(limit).lean();

      if (recommended.length < limit) {
        const gotIds = recommended.map((c: any) => c._id);
        const backfill = await Channel.find({ _id: { $nin: [...userChannelIds, ...gotIds] } })
          .sort({ memberCount: -1, createdAt: -1 })
          .skip(Math.max(0, skip - recommended.length)).limit(limit - recommended.length).lean();
        recommended = [...recommended, ...backfill];
      }
    } else {
      recommended = await Channel.find({ _id: { $nin: userChannelIds } })
        .sort({ memberCount: -1, createdAt: -1 }).skip(skip).limit(limit).lean();
    }

    const enriched = recommended.map((ch: any) => ({
      ...ch, isAdmin: false, isMember: false,
      hasPendingRequest: (ch.joinRequests || []).some((r: any) => r.userId.toString() === userId),
    }));

    return { channels: enriched, hasMore: enriched.length === limit };
  }

  async getMyChannels(userId: string, page: number, limit: number, type?: string) {
    if (!userId) throw new ValidationError('User context required');

    const skip = (page - 1) * limit;
    let filter: any = { 'members.userId': userId };
    if (type === 'created') {
      filter = { ...filter, $or: [{ adminId: userId }, { members: { $elemMatch: { userId, role: 'owner' } } }] };
    } else if (type === 'joined') {
      filter = { ...filter, adminId: { $ne: userId }, members: { $not: { $elemMatch: { userId, role: 'owner' } } } };
    }

    const [channels, total] = await Promise.all([
      Channel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Channel.countDocuments(filter),
    ]);

    const enriched = channels.map((ch: any) => ({
      ...ch, isOwner: isOwner(ch, userId), isAdmin: isAdmin(ch, userId), isMember: true,
    }));

    return { channels: enriched, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getById(userId: string, channelId: string) {
    const channel = await Channel.findById(channelId).lean();
    if (!channel) throw new NotFoundError('Channel');

    const ch = channel as any;
    return {
      ...ch,
      isOwner: isOwner(ch, userId), isAdmin: isAdmin(ch, userId),
      isMember: (ch.members || []).some((m: any) => m.userId.toString() === userId),
      hasPendingRequest: (ch.joinRequests || []).some((r: any) => r.userId.toString() === userId),
    };
  }

  async update(userId: string, channelId: string, body: any) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId);
    if (!channel) throw new NotFoundError('Channel');
    if (!isAdmin(channel, userId)) throw new ValidationError('Only channel admin can update');

    const { name, description, tags, profileImage, categories } = body;
    if (name !== undefined) channel.name = name.trim();
    if (description !== undefined) channel.description = description;
    if (profileImage !== undefined) channel.profileImage = profileImage;
    if (tags !== undefined) channel.tags = tags.map((t: string) => t.trim().toLowerCase()).slice(0, 10);
    if (categories !== undefined) channel.categories = categories.filter((c: string) => CHANNEL_CATEGORIES.includes(c as any)).slice(0, 10) as any;
    await channel.save();

    return channel;
  }

  async deleteChannel(userId: string, channelId: string, raid?: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId);
    if (!channel) throw new NotFoundError('Channel');
    if (!isOwner(channel, userId)) throw new ValidationError('Only channel owner can delete');

    logger.warn('Channel.delete: deleting channel', { raid, userId, meta: { channelId, name: channel.name, memberCount: (channel.members as any[]).length } });
    for (const m of channel.members as any[]) {
      if (m.userId.toString() !== userId) {
        broadcaster.emit(`user:${m.userId}`, 'channel:removed', { channelId: channel._id.toString(), channelName: channel.name });
      }
    }

    logger.info('Channel.delete: deleting all posts', { raid, userId, meta: { channelId } });
    await ChannelPost.deleteMany({ channelId: channel._id });
    await channel.deleteOne();
    logger.warn('Channel.delete: channel deleted', { raid, userId, meta: { channelId } });
  }

  // ── Membership ──

  async join(userId: string, userName: string, userEmail: string, channelId: string, raid?: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId);
    if (!channel) throw new NotFoundError('Channel');
    if (isMember(channel, userId)) throw new ValidationError('Already a member');
    if ((channel.joinRequests as any[]).some((r: any) => r.userId.toString() === userId)) {
      throw new ValidationError('Join request already pending');
    }

    logger.info('Channel.join: submitting join request', { raid, userId, meta: { channelId, channelName: channel.name } });
    (channel.joinRequests as any[]).push({ userId, userName, userEmail });
    await channel.save();

    this.publishNotification(channel.adminId.toString(), 'channel_join_request',
      'Channel join request', `${userName || 'Someone'} requested to join "${channel.name}"`,
      { channelId: channel._id.toString(), requestUserId: userId, requestUserName: userName });

    broadcaster.emit(`user:${channel.adminId}`, 'channel:join-request', {
      channelId: channel._id.toString(), channelName: channel.name, userId, userName,
    });
  }

  async approve(userId: string, channelId: string, targetUserId: string, raid?: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId);
    if (!channel) throw new NotFoundError('Channel');
    if (!isAdmin(channel, userId)) throw new ValidationError('Only admin can approve');

    const request = (channel.joinRequests as any[]).find((r: any) => r.userId.toString() === targetUserId);
    if (!request) throw new ValidationError('No pending request from this user');
    logger.info('Channel.approve: approving join request', { raid, userId, meta: { channelId, targetUserId, channelName: channel.name } });

    channel.joinRequests = (channel.joinRequests as any[]).filter((r: any) => r.userId.toString() !== targetUserId) as any;
    (channel.members as any[]).push({
      userId: targetUserId, userName: request.userName || '', userEmail: request.userEmail || '', role: 'member',
    });
    channel.memberCount = (channel.members as any[]).length;
    await channel.save();

    this.publishNotification(targetUserId, 'channel_join_approved',
      'Channel join approved', `Your request to join "${channel.name}" has been approved!`,
      { channelId: channel._id.toString(), channelName: channel.name });

    broadcaster.emit(`user:${targetUserId}`, 'channel:approved', {
      channelId: channel._id.toString(), channelName: channel.name,
    });

    return { members: channel.members, memberCount: channel.memberCount };
  }

  async reject(userId: string, channelId: string, targetUserId: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId);
    if (!channel) throw new NotFoundError('Channel');
    if (!isAdmin(channel, userId)) throw new ValidationError('Only admin can reject');

    channel.joinRequests = (channel.joinRequests as any[]).filter((r: any) => r.userId.toString() !== targetUserId) as any;
    await channel.save();

    try {
      const notification = await Notification.create({
        userId: targetUserId, type: 'channel_join_rejected',
        title: 'Channel request rejected',
        message: `Your request to join "${channel.name}" has been rejected.`,
        metadata: { channelId: channel._id.toString(), channelName: channel.name },
      });
      broadcaster.emit(`user:${targetUserId}`, 'notification', {
        _id: notification._id, type: notification.type, title: notification.title,
        message: (notification as any).message, metadata: (notification as any).metadata,
        read: false, createdAt: (notification as any).createdAt,
      });
    } catch (err) {
      console.error('[channels] Failed to create rejection notification:', err);
    }

    broadcaster.emit(`user:${targetUserId}`, 'channel:rejected', {
      channelId: channel._id.toString(), channelName: channel.name,
    });
  }

  async invite(userId: string, channelId: string, body: any) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId);
    if (!channel) throw new NotFoundError('Channel');
    if (!isAdmin(channel, userId)) throw new ValidationError('Only admin can invite');

    const { targetUserId, targetUserName = '', targetUserEmail = '' } = body;
    if (!targetUserId) throw new ValidationError('targetUserId is required');
    if (isMember(channel, targetUserId)) throw new ValidationError('User is already a member');

    (channel.members as any[]).push({
      userId: targetUserId, userName: targetUserName, userEmail: targetUserEmail, role: 'member',
    });
    channel.joinRequests = (channel.joinRequests as any[]).filter((r: any) => r.userId.toString() !== targetUserId) as any;
    channel.memberCount = (channel.members as any[]).length;
    await channel.save();

    this.publishNotification(targetUserId, 'channel_invite',
      'Channel invitation', `You have been invited to join "${channel.name}"`,
      { channelId: channel._id.toString(), channelName: channel.name, invitedBy: userId });

    broadcaster.emit(`user:${targetUserId}`, 'channel:invited', {
      channelId: channel._id.toString(), channelName: channel.name,
    });

    return { members: channel.members, memberCount: channel.memberCount };
  }

  async removeMember(userId: string, channelId: string, targetUserId: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId);
    if (!channel) throw new NotFoundError('Channel');
    if (!isAdmin(channel, userId)) throw new ValidationError('Only admin can remove members');
    if (targetUserId === userId) throw new ValidationError('Cannot remove yourself');

    const target = (channel.members as any[]).find((m: any) => m.userId.toString() === targetUserId);
    if (target?.role === 'owner') throw new ValidationError('Cannot remove the channel owner');

    channel.members = (channel.members as any[]).filter((m: any) => m.userId.toString() !== targetUserId) as any;
    channel.memberCount = (channel.members as any[]).length;
    await channel.save();

    broadcaster.emit(`user:${targetUserId}`, 'channel:removed', {
      channelId: channel._id.toString(), channelName: channel.name,
    });

    this.publishNotification(targetUserId, 'channel_invite',
      'Removed from channel', `You have been removed from "${channel.name}"`,
      { channelId: channel._id.toString(), channelName: channel.name });

    return { members: channel.members, memberCount: channel.memberCount };
  }

  async leave(userId: string, channelId: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId);
    if (!channel) throw new NotFoundError('Channel');
    if (isOwner(channel, userId)) throw new ValidationError('Owner cannot leave their own channel. Transfer ownership or delete the channel.');
    if (!isMember(channel, userId)) throw new ValidationError('Not a member');

    channel.members = (channel.members as any[]).filter((m: any) => m.userId.toString() !== userId) as any;
    channel.memberCount = (channel.members as any[]).length;
    await channel.save();
  }

  async getMembers(channelId: string) {
    const channel = await Channel.findById(channelId).lean();
    if (!channel) throw new NotFoundError('Channel');
    return (channel as any).members || [];
  }

  async updateMemberRole(userId: string, channelId: string, targetUserId: string, role: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId);
    if (!channel) throw new NotFoundError('Channel');

    if (!['admin', 'member'].includes(role)) throw new ValidationError('Invalid role. Must be admin or member');
    if (targetUserId === userId) throw new ValidationError('Cannot change your own role');

    const actorMember = (channel.members as any[]).find((m: any) => m.userId.toString() === userId);
    const targetMember = (channel.members as any[]).find((m: any) => m.userId.toString() === targetUserId);
    if (!targetMember) throw new ValidationError('User is not a member');
    if (targetMember.role === 'owner') throw new ValidationError('Cannot change owner role');
    if (!actorMember || actorMember.role !== 'owner') throw new ValidationError('Only the channel owner can change roles');

    targetMember.role = role;
    await channel.save();

    return { members: channel.members, memberCount: channel.memberCount };
  }

  // ── Workspace Attachment ──

  async attachWorkspace(userId: string, channelId: string, workspaceId: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId);
    if (!channel) throw new NotFoundError('Channel');
    if (!isAdmin(channel, userId)) throw new ValidationError('Only admin can attach workspaces');
    if (!workspaceId) throw new ValidationError('workspaceId is required');

    const already = (channel.attachedWorkspaces as any[]).some((id: any) => id.toString() === workspaceId);
    if (!already) {
      (channel.attachedWorkspaces as any[]).push(workspaceId);
      await channel.save();
    }

    return { attachedWorkspaces: channel.attachedWorkspaces };
  }

  async detachWorkspace(userId: string, channelId: string, workspaceId: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId);
    if (!channel) throw new NotFoundError('Channel');
    if (!isAdmin(channel, userId)) throw new ValidationError('Only admin can detach workspaces');

    channel.attachedWorkspaces = (channel.attachedWorkspaces as any[]).filter(
      (id: any) => id.toString() !== workspaceId,
    ) as any;
    await channel.save();

    return { attachedWorkspaces: channel.attachedWorkspaces };
  }

  // ── Private ──

  private publishNotification(userId: string, type: string, title: string, messageText: string, metadata: any) {
    publisher.publish('notifications', { userId, type, title, messageText, metadata },
      `notification.${type}`,
    ).catch(() => { /* ignore */ });
  }
}

export default new ChannelHandler();
