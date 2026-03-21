import fs from 'fs';
import path from 'path';
import Channel from '../../models/Channel';
import ChannelPost from '../../models/ChannelPost';
import { publisher } from '../publisher';
import { broadcaster } from '../broadcast';
import { NotFoundError, ValidationError } from '../errors';
import { extractYouTubeVideoId, moderateContent } from './ChannelHandler';
import logger from '../../Logger';

function isMember(channel: any, userId: string): boolean {
  return (channel.members || []).some((m: any) => m.userId.toString() === userId);
}

function isAdmin(channel: any, userId: string): boolean {
  return channel.adminId.toString() === userId ||
    (channel.members || []).some((m: any) => m.userId.toString() === userId && (m.role === 'owner' || m.role === 'admin'));
}

class PostHandler {
  async create(userId: string, userName: string, channelId: string, body: any, file: any, raid?: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId);
    if (!channel) throw new NotFoundError('Channel');
    if (!isAdmin(channel, userId)) throw new ValidationError('Only channel admin can create posts');

    const { type, title, content, youtubeUrl } = body;
    if (!type || !['pdf', 'youtube', 'markdown'].includes(type)) {
      throw new ValidationError('Post type must be pdf, youtube, or markdown');
    }
    if (!title?.trim()) throw new ValidationError('Post title is required');

    let fileUrl = '';
    let videoId = '';
    let moderationText = title;

    if (type === 'pdf') {
      if (!file) throw new ValidationError('PDF file is required');
      fileUrl = `/channel-uploads/${file.filename}`;
      moderationText = `${title}`;
    } else if (type === 'youtube') {
      if (!youtubeUrl) throw new ValidationError('YouTube URL is required');
      videoId = extractYouTubeVideoId(youtubeUrl) || '';
      if (!videoId) throw new ValidationError('Invalid YouTube URL');
      moderationText = `${title} ${youtubeUrl} ${content || ''}`;
    } else if (type === 'markdown') {
      if (!content?.trim()) throw new ValidationError('Markdown content is required');
      moderationText = `${title} ${content}`;
    }

    const modResult = await moderateContent(moderationText, raid);
    if (!modResult.safe) {
      logger.warn('Post.create: content rejected by moderation', { raid, userId, meta: { channelId, reason: modResult.reason } });
      if (file) { try { fs.unlinkSync(file.path); } catch { /* ignore */ } }
      throw new ValidationError(`Content rejected: ${modResult.reason || 'Contains sensitive or inappropriate content'}`);
    }

    logger.info('Post.create: moderation passed, creating post', { raid, userId, meta: { channelId, type, title: title.trim() } });
    const post = await ChannelPost.create({
      channelId: channel._id, authorId: userId, authorName: userName,
      type, title: title.trim(), content: content || '', fileUrl,
      youtubeUrl: youtubeUrl || '', youtubeVideoId: videoId,
    });

    channel.postCount = await ChannelPost.countDocuments({ channelId: channel._id });
    await channel.save();

    broadcaster.emit(`channel:${channel._id}`, 'channel:new-post', {
      channelId: channel._id.toString(), channelName: channel.name, post: post.toObject(),
    });

    // Notify all members except author
    const otherMembers = (channel.members as any[]).filter((m: any) => m.userId.toString() !== userId);
    for (const member of otherMembers) {
      publisher.publish('notifications', {
        userId: member.userId.toString(), type: 'channel_post',
        title: `New post in ${channel.name}`,
        messageText: `${userName} posted "${title.trim()}" in ${channel.name}`,
        metadata: { channelId: channel._id.toString(), postId: post._id.toString(), channelName: channel.name },
      }, 'notification.channel_post').catch(() => { /* ignore */ });
    }

    return post;
  }

  async list(userId: string, channelId: string, page: number, limit: number, sort: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId).lean();
    if (!channel) throw new NotFoundError('Channel');
    if (!isMember(channel as any, userId)) throw new ValidationError('Join the channel to view posts');

    const skip = (page - 1) * limit;
    const sortObj = sort === 'popular' ? { likeCount: -1, createdAt: -1 } : { createdAt: -1 };

    const [posts, total] = await Promise.all([
      ChannelPost.find({ channelId }).sort(sortObj as any).skip(skip).limit(limit).lean(),
      ChannelPost.countDocuments({ channelId }),
    ]);

    const enriched = posts.map((p: any) => ({
      ...p,
      userLiked: (p.likes || []).some((id: any) => id.toString() === userId),
      userDisliked: (p.dislikes || []).some((id: any) => id.toString() === userId),
      comments: (p.comments || []).slice(0, 3),
    }));

    return { posts: enriched, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async deletePost(userId: string, channelId: string, postId: string, raid?: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId);
    if (!channel) throw new NotFoundError('Channel');
    if (!isAdmin(channel, userId)) throw new ValidationError('Only admin can delete posts');

    const post = await ChannelPost.findOne({ _id: postId, channelId: channel._id });
    if (!post) throw new NotFoundError('Post');

    logger.warn('Post.delete: deleting post', { raid, userId, meta: { channelId, postId, type: post.type } });

    if (post.fileUrl) {
      const filePath = path.resolve(process.cwd(), post.fileUrl.replace(/^\//, ''));
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
    }

    await post.deleteOne();
    channel.postCount = await ChannelPost.countDocuments({ channelId: channel._id });
    await channel.save();

    broadcaster.emit(`channel:${channel._id}`, 'channel:post-deleted', {
      channelId: channel._id.toString(), postId,
    });
  }

  async toggleLike(userId: string, channelId: string, postId: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId).lean();
    if (!channel) throw new NotFoundError('Channel');
    if (!isMember(channel as any, userId)) throw new ValidationError('Must be a member');

    const post = await ChannelPost.findOne({ _id: postId, channelId });
    if (!post) throw new NotFoundError('Post');

    const alreadyLiked = (post.likes as any[]).some((id: any) => id.toString() === userId);
    if (alreadyLiked) {
      post.likes = (post.likes as any[]).filter((id: any) => id.toString() !== userId) as any;
    } else {
      (post.likes as any[]).push(userId);
      post.dislikes = (post.dislikes as any[]).filter((id: any) => id.toString() !== userId) as any;
    }
    post.likeCount = (post.likes as any[]).length;
    post.dislikeCount = (post.dislikes as any[]).length;
    await post.save();

    broadcaster.emit(`channel:${(channel as any)._id}`, 'channel:post-liked', {
      channelId: (channel as any)._id.toString(), postId: post._id.toString(),
      likeCount: post.likeCount, dislikeCount: post.dislikeCount,
    });

    return { likeCount: post.likeCount, dislikeCount: post.dislikeCount, userLiked: !alreadyLiked, userDisliked: false };
  }

  async toggleDislike(userId: string, channelId: string, postId: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId).lean();
    if (!channel) throw new NotFoundError('Channel');
    if (!isMember(channel as any, userId)) throw new ValidationError('Must be a member');

    const post = await ChannelPost.findOne({ _id: postId, channelId });
    if (!post) throw new NotFoundError('Post');

    const alreadyDisliked = (post.dislikes as any[]).some((id: any) => id.toString() === userId);
    if (alreadyDisliked) {
      post.dislikes = (post.dislikes as any[]).filter((id: any) => id.toString() !== userId) as any;
    } else {
      (post.dislikes as any[]).push(userId);
      post.likes = (post.likes as any[]).filter((id: any) => id.toString() !== userId) as any;
    }
    post.likeCount = (post.likes as any[]).length;
    post.dislikeCount = (post.dislikes as any[]).length;
    await post.save();

    broadcaster.emit(`channel:${(channel as any)._id}`, 'channel:post-liked', {
      channelId: (channel as any)._id.toString(), postId: post._id.toString(),
      likeCount: post.likeCount, dislikeCount: post.dislikeCount,
    });

    return { likeCount: post.likeCount, dislikeCount: post.dislikeCount, userLiked: false, userDisliked: !alreadyDisliked };
  }

  async addComment(userId: string, userName: string, channelId: string, postId: string, content: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId).lean();
    if (!channel) throw new NotFoundError('Channel');
    if (!isMember(channel as any, userId)) throw new ValidationError('Must be a member');
    if (!content?.trim()) throw new ValidationError('Comment content is required');

    const post = await ChannelPost.findOne({ _id: postId, channelId });
    if (!post) throw new NotFoundError('Post');

    const comment = { userId, userName, content: content.trim(), createdAt: new Date() };
    (post.comments as any[]).push(comment);
    post.commentCount = (post.comments as any[]).length;
    await post.save();

    const savedComment = { ...comment, _id: (post.comments as any[])[(post.comments as any[]).length - 1]._id };

    broadcaster.emit(`channel:${(channel as any)._id}`, 'channel:new-comment', {
      channelId: (channel as any)._id.toString(), postId: post._id.toString(), comment: savedComment,
    });

    return { comment: savedComment, commentCount: post.commentCount };
  }

  async getComments(userId: string, channelId: string, postId: string) {
    if (!userId) throw new ValidationError('User context required');
    const channel = await Channel.findById(channelId).lean();
    if (!channel) throw new NotFoundError('Channel');
    if (!isMember(channel as any, userId)) throw new ValidationError('Must be a member');

    const post = await ChannelPost.findOne({ _id: postId, channelId }).lean();
    if (!post) throw new NotFoundError('Post');

    return (post as any).comments || [];
  }
}

export default new PostHandler();
