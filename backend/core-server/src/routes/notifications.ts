/**
 * CORE SERVER — Notification Routes
 */

import { Router, Request, Response } from 'express';
import Notification from '../models/Notification';
import { ValidationError } from '../utils/errors';
import { broadcaster } from '../utils/broadcast';

const router = Router();

/**
 * POST /api/notifications — Create a notification and broadcast in real-time
 *
 * @body {string} userId   - Target user ID
 * @body {string} type     - Notification type (e.g. chat_shared, document_shared)
 * @body {string} title    - Notification title
 * @body {string} [message]  - Notification body text
 * @body {object} [metadata] - Extra metadata (conversationId, documentId, etc.)
 *
 * @response 201 { success, data: Notification }
 */
router.post('/', async (req: Request, res: Response) => {
  const { userId, type, title, message, metadata } = req.body;
  if (!userId || !type || !title) throw new ValidationError('userId, type, and title are required');

  const notification = await Notification.create({
    userId, type, title,
    message: message || '',
    metadata: metadata || {},
  });

  broadcaster.emit(`user:${userId}`, 'notification', {
    _id: notification._id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    metadata: notification.metadata,
    read: false,
    createdAt: (notification as any).createdAt,
  });

  res.status(201).json({ success: true, data: notification });
});

/**
 * GET /api/notifications — List notifications for the current user (newest first)
 *
 * @query {number} [page=1]    - Page number
 * @query {number} [limit=20]  - Results per page (max 100)
 *
 * @response 200 { success, data: Notification[], pagination: { page, limit, total, pages }, unreadCount }
 */
router.get('/', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) throw new ValidationError('User context required');

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const skip = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments({ userId }),
    Notification.countDocuments({ userId, read: false }),
  ]);

  res.json({
    success: true,
    data: notifications,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    unreadCount,
  });
});

/**
 * PATCH /api/notifications/:id/read — Mark a single notification as read
 *
 * @param {string} id - Notification ID
 *
 * @response 200 { success: true }
 */
router.patch('/:id/read', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) throw new ValidationError('User context required');

  await Notification.findOneAndUpdate({ _id: req.params.id, userId }, { read: true });
  res.json({ success: true });
});

/**
 * POST /api/notifications/read-all — Mark all notifications as read
 *
 * @response 200 { success: true }
 */
router.post('/read-all', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) throw new ValidationError('User context required');

  await Notification.updateMany({ userId, read: false }, { read: true });
  res.json({ success: true });
});

export default router;
