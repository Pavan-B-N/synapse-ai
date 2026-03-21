/**
 * CORE SERVER — Workspace (Group) Routes
 */

import { Router, Request, Response } from 'express';
import groupHandler from '../utils/handler/GroupHandler';
import logger from '../Logger';

const router = Router();

interface IdParams { id: string }
interface DocIdParams { docId: string }
interface MemberParams { id: string; memberId: string }

// ── CRUD Routes ──

/**
 * POST /api/groups — Create a new workspace
 *
 * Creator is automatically the owner.
 *
 * @body {string}   name         - Workspace name
 * @body {string}   [description] - Description
 * @body {string[]} [documentIds] - Initial document IDs
 *
 * @response 201 { success, data: { ...group, documents, messageCount: 0 } }
 */
router.post('/', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const userName = (req as any).user?.name || '';
  const userEmail = (req as any).user?.email || '';
  const raid = (req as any).raid;
  const result = await groupHandler.create(userId, userName, userEmail, req.body, raid);
  logger.info('Workspace created', { raid, userId, meta: { groupId: result._id, name: req.body.name } });
  res.status(201).json({ success: true, data: result });
});

/**
 * GET /api/groups — List workspaces the user owns or is a member of
 *
 * @response 200 { success, data: [ { ...group, documents, messageCount, isOwner, userRole, memberCount } ] }
 */
router.get('/', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const raid = (req as any).raid;
  const result = await groupHandler.list(userId, raid);
  res.json({ success: true, data: result });
});

/**
 * GET /api/groups/:id — Get a specific workspace (owner or member)
 *
 * @param {string} id - Workspace ID
 *
 * @response 200 { success, data: { ...group, documents, chatHistory, messageCount, isOwner, userRole, members } }
 */
router.get('/:id', async (req: Request<IdParams>, res: Response) => {
  const userId = (req as any).user?.userId;
  const raid = (req as any).raid;
  const result = await groupHandler.getById(userId, req.params.id, raid);
  res.json({ success: true, data: result });
});

/**
 * PUT /api/groups/:id — Update a workspace (owner or editor only)
 *
 * Auto-shares newly added documents with all workspace members.
 *
 * @param {string}   id            - Workspace ID
 * @body  {string}   [name]        - New name
 * @body  {string}   [description] - New description
 * @body  {string[]} [documentIds] - Updated document ID list
 *
 * @response 200 { success, data: group }
 */
router.put('/:id', async (req: Request<IdParams>, res: Response) => {
  const userId = (req as any).user?.userId;
  const userName = (req as any).user?.name || 'Someone';
  const raid = (req as any).raid;
  const result = await groupHandler.update(userId, userName, req.params.id, req.body, raid);
  res.json({ success: true, data: result });
});

/**
 * DELETE /api/groups/documents/:docId — Remove a document from all user workspaces
 *
 * @param {string} docId - Document ID to remove
 *
 * @response 200 { success, message }
 */
router.delete('/documents/:docId', async (req: Request<DocIdParams>, res: Response) => {
  const userId = (req as any).user?.userId;
  const count = await groupHandler.removeDocumentFromAll(userId, req.params.docId);
  res.json({ success: true, message: `Removed from ${count} workspace(s)` });
});

/**
 * DELETE /api/groups/:id — Delete a workspace (owner only)
 *
 * Also deletes all associated workspace messages.
 *
 * @param {string} id - Workspace ID
 *
 * @response 200 { success, message }
 */
router.delete('/:id', async (req: Request<IdParams>, res: Response) => {
  const userId = (req as any).user?.userId;
  await groupHandler.deleteGroup(userId, req.params.id);
  res.json({ success: true, message: 'Group deleted' });
});

/**
 * POST /api/groups/:id/documents — Add documents to a workspace
 *
 * @param  {string}   id          - Workspace ID
 * @body   {string[]} documentIds - Document IDs to add
 *
 * @response 200 { success, data: group }
 */
router.post('/:id/documents', async (req: Request<IdParams>, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await groupHandler.addDocuments(userId, req.params.id, req.body.documentIds);
  res.json({ success: true, data: result });
});

// ── Sharing Routes ──

/**
 * POST /api/groups/:id/share — Share workspace with another user
 *
 * Auto-shares all workspace documents with the new member.
 *
 * @param  {string} id              - Workspace ID
 * @body   {string} targetUserId    - User to share with
 * @body   {string} [role=viewer]   - Role: editor | viewer | readonly
 * @body   {string} [targetUserName]  - Display name
 * @body   {string} [targetUserEmail] - Email
 *
 * @response 200 { success, data: { members, visibility } }
 */
router.post('/:id/share', async (req: Request<IdParams>, res: Response) => {
  const userId = (req as any).user?.userId;
  const raid = (req as any).raid;
  const result = await groupHandler.share(userId, req.params.id, req.body, raid);
  res.json({ success: true, data: result });
});

/**
 * PUT /api/groups/:id/members/:memberId — Change a member's role (owner only)
 *
 * @param {string} id       - Workspace ID
 * @param {string} memberId - Member user ID
 * @body  {string} role     - New role: editor | viewer | readonly
 *
 * @response 200 { success, data: { members } }
 */
router.put('/:id/members/:memberId', async (req: Request<MemberParams>, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await groupHandler.updateMemberRole(userId, req.params.id, req.params.memberId, req.body.role);
  res.json({ success: true, data: result });
});

/**
 * DELETE /api/groups/:id/members/:memberId — Remove a member (owner only)
 *
 * Sends notification to removed user. Reverts visibility to private if no members remain.
 *
 * @param {string} id       - Workspace ID
 * @param {string} memberId - Member user ID to remove
 *
 * @response 200 { success, data: { members, visibility } }
 */
router.delete('/:id/members/:memberId', async (req: Request<MemberParams>, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await groupHandler.removeMember(userId, req.params.id, req.params.memberId);
  res.json({ success: true, data: result });
});

// ── Chat Routes ──

/**
 * POST /api/groups/:id/chat — Chat with documents via AI
 *
 * Sends user message, builds AI context from workspace documents + recent history,
 * then returns AI response. Both messages are persisted and broadcast in real-time.
 *
 * @param {string} id      - Workspace ID
 * @body  {string} message - User message
 *
 * @response 200 { success, data: { reply, chatHistory } }
 */
router.post('/:id/chat', async (req: Request<IdParams>, res: Response) => {
  const userId = (req as any).user?.userId;
  const userName = (req as any).user?.name || 'User';
  const raid = (req as any).raid;
  const result = await groupHandler.chat(userId, userName, req.params.id, req.body.message, raid);
  res.json({ success: true, data: result });
});

/**
 * GET /api/groups/:id/messages — Get workspace chat messages (paginated)
 *
 * @param {string} id        - Workspace ID
 * @query {number} [page=1]  - Page number
 * @query {number} [limit=50] - Results per page (max 200)
 *
 * @response 200 { success, data: messages, pagination: { page, limit, total, pages } }
 */
router.get('/:id/messages', async (req: Request<IdParams>, res: Response) => {
  const userId = (req as any).user?.userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const result = await groupHandler.getMessages(userId, req.params.id, page, limit);
  res.json({ success: true, data: result.messages, pagination: result.pagination });
});

export default router;
