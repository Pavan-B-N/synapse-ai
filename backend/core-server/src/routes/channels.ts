/**
 * CORE SERVER — Channel Routes
 */

import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { CHANNEL_CATEGORIES } from '../constants';
import channelHandler from '../utils/handler/ChannelHandler';
import postHandler from '../utils/handler/PostHandler';
import logger from '../Logger';

const router = Router();

// ── Upload config for channel PDFs ──
const uploadDir = path.resolve(process.cwd(), 'channel-uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req: Express.Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => cb(null, uploadDir),
  filename: (_req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const fileFilter = (_req: any, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (file.mimetype === 'application/pdf' || file.originalname?.match(/\.pdf$/i)) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

// ══════════════════════════════════════════
//  CHANNEL CRUD
// ══════════════════════════════════════════

/**
 * GET /api/channels/categories — List predefined channel categories
 *
 * @response 200 { success, data: string[] }
 */
router.get('/categories', async (_req: Request, res: Response) => {
  res.json({ success: true, data: CHANNEL_CATEGORIES });
});

/**
 * POST /api/channels — Create a new study channel
 *
 * Creator becomes admin/owner.
 *
 * @body {string}   name          - Channel name
 * @body {string}   [description] - Description
 * @body {string[]} [tags]        - Tags (max 10)
 * @body {string}   [profileImage] - Profile image URL
 * @body {string[]} [categories]  - Category labels
 *
 * @response 201 { success, data: channel }
 */
router.post('/', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const userName = (req as any).user?.name || '';
  const userEmail = (req as any).user?.email || '';
  const result = await channelHandler.create(userId, userName, userEmail, req.body, (req as any).raid);
  logger.info('Channel created', { raid: (req as any).raid, userId, meta: { channelId: result._id, name: req.body.name } });
  res.status(201).json({ success: true, data: result });
});

/**
 * GET /api/channels — List/search channels (paginated)
 *
 * @query {string} [search]   - Keyword search (name, description, tags)
 * @query {number} [page=1]   - Page number
 * @query {number} [limit=20] - Results per page (max 50)
 *
 * @response 200 { success, data: [ channel ], pagination }
 */
router.get('/', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const search = (req.query.search as string || '').trim();
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const result = await channelHandler.list(userId, search, page, limit);
  res.json({ success: true, data: result.channels, pagination: result.pagination });
});

/**
 * GET /api/channels/recommended — Get recommended channels
 *
 * Based on user interests (categories + tags from joined channels).
 *
 * @query {number} [limit=20] - Max results (max 50)
 * @query {number} [skip=0]   - Offset
 *
 * @response 200 { success, data: [ channel ], hasMore }
 */
router.get('/recommended', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const skip = parseInt(req.query.skip as string) || 0;
  const result = await channelHandler.getRecommended(userId, limit, skip);
  res.json({ success: true, data: result.channels, hasMore: result.hasMore });
});

/**
 * GET /api/channels/my — List channels the user is a member of
 *
 * @query {string} [type]      - Filter: 'created' | 'joined'
 * @query {number} [page=1]    - Page number
 * @query {number} [limit=10]  - Results per page (max 50)
 *
 * @response 200 { success, data: [ channel ], pagination }
 */
router.get('/my', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const type = req.query.type as string;
  const result = await channelHandler.getMyChannels(userId, page, limit, type);
  res.json({ success: true, data: result.channels, pagination: result.pagination });
});

/**
 * GET /api/channels/:id — Get channel details + membership status
 *
 * @param {string} id - Channel ID
 *
 * @response 200 { success, data: { ...channel, isOwner, isAdmin, isMember, hasPendingRequest } }
 */
router.get('/:id', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await channelHandler.getById(userId, req.params.id as string);
  res.json({ success: true, data: result });
});

/**
 * PUT /api/channels/:id — Update channel (admin only)
 *
 * @param {string}   id            - Channel ID
 * @body  {string}   [name]        - New name
 * @body  {string}   [description] - New description
 * @body  {string[]} [tags]        - Updated tags
 * @body  {string}   [profileImage] - Profile image URL
 * @body  {string[]} [categories]  - Updated categories
 *
 * @response 200 { success, data: channel }
 */
router.put('/:id', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await channelHandler.update(userId, req.params.id as string, req.body);
  res.json({ success: true, data: result });
});

/**
 * DELETE /api/channels/:id — Delete channel (owner only)
 *
 * Notifies all members and deletes all posts.
 *
 * @param {string} id - Channel ID
 *
 * @response 200 { success, message }
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  await channelHandler.deleteChannel(userId, req.params.id as string, (req as any).raid);
  res.json({ success: true, message: 'Channel deleted' });
});

// ══════════════════════════════════════════
//  MEMBERSHIP: JOIN, INVITE, APPROVE
// ══════════════════════════════════════════

/**
 * POST /api/channels/:id/join — Request to join a channel
 *
 * Admin must approve. Sends notification to channel admin.
 *
 * @param {string} id - Channel ID
 *
 * @response 200 { success, message }
 */
router.post('/:id/join', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const userName = (req as any).user?.name || '';
  const userEmail = (req as any).user?.email || '';
  await channelHandler.join(userId, userName, userEmail, req.params.id as string, (req as any).raid);
  res.json({ success: true, message: 'Join request sent' });
});

/**
 * POST /api/channels/:id/approve/:targetUserId — Approve a join request (admin only)
 *
 * @param {string} id           - Channel ID
 * @param {string} targetUserId - User to approve
 *
 * @response 200 { success, data: { members, memberCount } }
 */
router.post('/:id/approve/:targetUserId', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await channelHandler.approve(userId, req.params.id as string, req.params.targetUserId as string, (req as any).raid);
  res.json({ success: true, data: result });
});

/**
 * POST /api/channels/:id/reject/:targetUserId — Reject a join request (admin only)
 *
 * @param {string} id           - Channel ID
 * @param {string} targetUserId - User to reject
 *
 * @response 200 { success, message }
 */
router.post('/:id/reject/:targetUserId', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  await channelHandler.reject(userId, req.params.id as string, req.params.targetUserId as string);
  res.json({ success: true, message: 'Request rejected' });
});

/**
 * POST /api/channels/:id/invite — Invite a user to join (admin only)
 *
 * Adds the user directly as a member.
 *
 * @param  {string} id              - Channel ID
 * @body   {string} targetUserId    - User to invite
 * @body   {string} [targetUserName]  - Display name
 * @body   {string} [targetUserEmail] - Email
 *
 * @response 200 { success, data: { members, memberCount } }
 */
router.post('/:id/invite', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await channelHandler.invite(userId, req.params.id as string, req.body);
  res.json({ success: true, data: result });
});

/**
 * DELETE /api/channels/:id/members/:targetUserId — Remove a member (admin only)
 *
 * @param {string} id           - Channel ID
 * @param {string} targetUserId - User to remove
 *
 * @response 200 { success, data: { members, memberCount } }
 */
router.delete('/:id/members/:targetUserId', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await channelHandler.removeMember(userId, req.params.id as string, req.params.targetUserId as string);
  res.json({ success: true, data: result });
});

/**
 * POST /api/channels/:id/leave — Leave a channel (admin cannot leave)
 *
 * @param {string} id - Channel ID
 *
 * @response 200 { success, message }
 */
router.post('/:id/leave', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  await channelHandler.leave(userId, req.params.id as string);
  res.json({ success: true, message: 'Left channel' });
});

/**
 * GET /api/channels/:id/members — Get all channel members
 *
 * @param {string} id - Channel ID
 *
 * @response 200 { success, data: [ member ] }
 */
router.get('/:id/members', async (req: Request, res: Response) => {
  const result = await channelHandler.getMembers(req.params.id as string);
  res.json({ success: true, data: result });
});

/**
 * PUT /api/channels/:id/members/:targetUserId/role — Change member role (owner only)
 *
 * @param {string} id           - Channel ID
 * @param {string} targetUserId - User whose role to change
 * @body  {string} role         - New role: 'admin' | 'member'
 *
 * @response 200 { success, data: { members, memberCount } }
 */
router.put('/:id/members/:targetUserId/role', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await channelHandler.updateMemberRole(userId, req.params.id as string, req.params.targetUserId as string, req.body.role);
  res.json({ success: true, data: result });
});

// ══════════════════════════════════════════
//  WORKSPACE ATTACHMENT
// ══════════════════════════════════════════

/**
 * POST /api/channels/:id/attach-workspace — Attach workspace (admin only)
 *
 * @param {string} id          - Channel ID
 * @body  {string} workspaceId - Workspace to attach
 *
 * @response 200 { success, data: { attachedWorkspaces } }
 */
router.post('/:id/attach-workspace', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await channelHandler.attachWorkspace(userId, req.params.id as string, req.body.workspaceId);
  res.json({ success: true, data: result });
});

/**
 * DELETE /api/channels/:id/attach-workspace/:workspaceId — Detach workspace (admin only)
 *
 * @param {string} id          - Channel ID
 * @param {string} workspaceId - Workspace to detach
 *
 * @response 200 { success, data: { attachedWorkspaces } }
 */
router.delete('/:id/attach-workspace/:workspaceId', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await channelHandler.detachWorkspace(userId, req.params.id as string, req.params.workspaceId as string);
  res.json({ success: true, data: result });
});

// ══════════════════════════════════════════
//  POSTS: CRUD with AI moderation
// ══════════════════════════════════════════

/**
 * POST /api/channels/:id/posts — Create a post (admin only, AI moderated)
 *
 * For PDF: multipart form with `file` + `title` + `type=pdf`
 * For youtube/markdown: JSON body
 *
 * @param  {string} id        - Channel ID
 * @body   {string} type      - Post type: 'pdf' | 'youtube' | 'markdown'
 * @body   {string} title     - Post title
 * @body   {string} [content] - Markdown content (required for markdown type)
 * @body   {string} [youtubeUrl] - YouTube URL (required for youtube type)
 * @body   {File}   [file]    - PDF file (required for pdf type)
 *
 * @response 201 { success, data: post }
 */
router.post('/:id/posts', upload.single('file'), async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const userName = (req as any).user?.name || '';
  const raid = (req as any).raid;
  const result = await postHandler.create(userId, userName, req.params.id as string, req.body, req.file, raid);
  res.status(201).json({ success: true, data: result });
});

/**
 * GET /api/channels/:id/posts — List posts (members only, paginated)
 *
 * @param {string} id         - Channel ID
 * @query {number} [page=1]   - Page number
 * @query {number} [limit=10] - Results per page (max 50)
 * @query {string} [sort=latest] - Sort: 'latest' | 'popular'
 *
 * @response 200 { success, data: [ post ], pagination }
 */
router.get('/:id/posts', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const sort = (req.query.sort as string) || 'latest';
  const result = await postHandler.list(userId, req.params.id as string, page, limit, sort);
  res.json({ success: true, data: result.posts, pagination: result.pagination });
});

/**
 * DELETE /api/channels/:id/posts/:postId — Delete a post (admin only)
 *
 * @param {string} id     - Channel ID
 * @param {string} postId - Post ID
 *
 * @response 200 { success, message }
 */
router.delete('/:id/posts/:postId', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  await postHandler.deletePost(userId, req.params.id as string, req.params.postId as string, (req as any).raid);
  res.json({ success: true, message: 'Post deleted' });
});

// ══════════════════════════════════════════
//  LIKES, DISLIKES, COMMENTS
// ══════════════════════════════════════════

/**
 * POST /api/channels/:id/posts/:postId/like — Toggle like (members only)
 *
 * @param {string} id     - Channel ID
 * @param {string} postId - Post ID
 *
 * @response 200 { success, data: { likeCount, dislikeCount, userLiked, userDisliked } }
 */
router.post('/:id/posts/:postId/like', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await postHandler.toggleLike(userId, req.params.id as string, req.params.postId as string);
  res.json({ success: true, data: result });
});

/**
 * POST /api/channels/:id/posts/:postId/dislike — Toggle dislike (members only)
 *
 * @param {string} id     - Channel ID
 * @param {string} postId - Post ID
 *
 * @response 200 { success, data: { likeCount, dislikeCount, userLiked, userDisliked } }
 */
router.post('/:id/posts/:postId/dislike', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await postHandler.toggleDislike(userId, req.params.id as string, req.params.postId as string);
  res.json({ success: true, data: result });
});

/**
 * POST /api/channels/:id/posts/:postId/comments — Add comment (members only)
 *
 * @param  {string} id      - Channel ID
 * @param  {string} postId  - Post ID
 * @body   {string} content - Comment text
 *
 * @response 201 { success, data: { comment, commentCount } }
 */
router.post('/:id/posts/:postId/comments', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const userName = (req as any).user?.name || '';
  const result = await postHandler.addComment(userId, userName, req.params.id as string, req.params.postId as string, req.body.content);
  res.status(201).json({ success: true, data: result });
});

/**
 * GET /api/channels/:id/posts/:postId/comments — Get all comments (members only)
 *
 * @param {string} id     - Channel ID
 * @param {string} postId - Post ID
 *
 * @response 200 { success, data: [ comment ] }
 */
router.get('/:id/posts/:postId/comments', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await postHandler.getComments(userId, req.params.id as string, req.params.postId as string);
  res.json({ success: true, data: result });
});

export default router;
