/**
 * AUTH SERVER — Routes
 */

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/serviceAuth';
import authHandler from '../utils/handler/AuthHandler';
import logger from '../Logger';

const router = Router();

/**
 * POST /api/auth/register — Create new user and send OTP
 *
 * @body {string} name     - Display name
 * @body {string} email    - Email address
 * @body {string} password - Password (min 6 chars)
 *
 * @response 201 { success, data: { userId, email, requiresOTP: true }, message }
 */
router.post('/register', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, email, password } = req.body;
    const result = await authHandler.register(name, email, password, (req as any).raid);
    logger.info('User registered', { raid: (req as any).raid, userId: result.userId, meta: { email } });
    res.status(201).json({ success: true, data: result, message: 'OTP sent to your email. Please verify to complete registration.' });
  } catch (error) { next(error); }
});

/**
 * POST /api/auth/login — Validate credentials and send OTP
 *
 * @body {string} email    - Email address
 * @body {string} password - Password
 *
 * @response 200 { success, data: { userId, email, requiresOTP: true }, message }
 */
router.post('/login', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const result = await authHandler.login(email, password, (req as any).raid);
    logger.info('User login attempt', { raid: (req as any).raid, userId: result.userId, meta: { email } });
    res.json({ success: true, data: result, message: 'OTP sent to your email.' });
  } catch (error) { next(error); }
});

/**
 * POST /api/auth/verify-otp — Verify OTP and issue JWT tokens
 *
 * @body {string} userId - User ID returned from register/login
 * @body {string} otp    - 6-digit OTP code
 *
 * @response 200 { success, data: { user, token, refreshToken } }
 */
router.post('/verify-otp', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { userId, otp } = req.body;
    const result = await authHandler.verifyOTP(userId, otp, (req as any).raid);
    logger.info('OTP verified', { raid: (req as any).raid, userId });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * POST /api/auth/resend-otp — Resend a fresh OTP
 *
 * @body {string} userId - User ID to resend OTP for
 *
 * @response 200 { success, message }
 */
router.post('/resend-otp', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await authHandler.resendOTP(req.body.userId, (req as any).raid);
    res.json({ success: true, message: 'OTP resent to your email.' });
  } catch (error) { next(error); }
});

/**
 * GET /api/auth/profile — Get current user profile (requires x-user-id header)
 *
 * @response 200 { success, data: { user } }
 */
router.get('/profile', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await authHandler.getProfile(req.user?.userId || '', (req as any).raid);
    res.json({ success: true, data: { user } });
  } catch (error) { next(error); }
});

/**
 * POST /api/auth/refresh-token — Refresh access token using refresh token (with rotation)
 *
 * @body {string} refreshToken - Current refresh token
 *
 * @response 200 { success, data: { token, refreshToken } }
 */
router.post('/refresh-token', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await authHandler.refreshToken(req.body.refreshToken, (req as any).raid);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * GET /api/auth/users/search — Search users by name or email
 *
 * @query {string} q       - Search query (min 2 chars, regex-safe)
 * @query {number} [limit=5]  - Max results (max 20)
 * @query {number} [skip=0]   - Offset for pagination
 *
 * @response 200 { success, data: { users, total, hasMore } }
 */
router.get('/users/search', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string || '').trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);
    const skip = parseInt(req.query.skip as string) || 0;
    const result = await authHandler.searchUsers(req.user?.userId || '', q, limit, skip, (req as any).raid);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * POST /api/auth/users/batch — Batch user lookup by IDs
 *
 * @body {string[]} userIds - Array of user IDs (max 50)
 *
 * @response 200 { success, data: { users } }
 */
router.post('/users/batch', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await authHandler.batchUsers(req.user?.userId || '', req.body.userIds, (req as any).raid);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * PUT /api/auth/profile — Update user profile
 *
 * @body {string} [name]        - New display name
 * @body {object} [preferences] - User preferences object
 *
 * @response 200 { success, data: { user } }
 */
router.put('/profile', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, preferences } = req.body;
    const user = await authHandler.updateProfile(req.user?.userId || '', name, preferences, (req as any).raid);
    res.json({ success: true, data: { user } });
  } catch (error) { next(error); }
});

/**
 * DELETE /api/auth/account — Delete user account and cascade cleanup
 *
 * Publishes an `account-deleted` event to Service Bus for async cleanup.
 * Falls back to direct MongoDB cleanup if Service Bus is unavailable.
 *
 * @response 200 { success, message: "Account deleted" }
 */
router.delete('/account', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await authHandler.deleteAccount(req.user?.userId || '', (req as any).raid);
    logger.warn('Account deleted', { raid: (req as any).raid, userId: req.user?.userId });
    res.json({ success: true, message: 'Account deleted' });
  } catch (error) { next(error); }
});

export default router;
