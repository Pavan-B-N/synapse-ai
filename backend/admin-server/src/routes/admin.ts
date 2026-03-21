/**
 * ADMIN SERVER — Routes
 */

import { Router, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';
import { adminAuth, AdminRequest } from '../middleware/adminAuth';
import adminHandler from '../utils/handler/AdminHandler';
import logger from '../Logger';

const router = Router();

/**
 * POST /api/admin/login — Authenticate admin with email + password, sends OTP
 *
 * @body {string} email    - Admin email address
 * @body {string} password - Admin password
 *
 * @response 200 { success, data: { adminId, email, requiresOTP }, message }
 */
router.post('/login', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const result = await adminHandler.login(email, password);
    logger.info('Admin login attempt', { userId: result.adminId, meta: { email } });
    res.json({ success: true, data: result, message: 'OTP sent to your email.' });
  } catch (error) { next(error); }
});

/**
 * POST /api/admin/verify-otp — Verify OTP and receive admin JWT + refresh token
 *
 * @body {string} adminId - Admin user ID (from login response)
 * @body {string} otp     - 8-digit OTP from email
 *
 * @response 200 { success, data: { admin, token, refreshToken } }
 */
router.post('/verify-otp', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { adminId, otp } = req.body;
    const result = await adminHandler.verifyOTP(adminId, otp);
    logger.info('Admin OTP verified', { userId: adminId });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * POST /api/admin/resend-otp — Resend a new OTP to the admin's email
 *
 * @body {string} adminId - Admin user ID
 *
 * @response 200 { success, message }
 */
router.post('/resend-otp', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    await adminHandler.resendOTP(req.body.adminId);
    res.json({ success: true, message: 'OTP resent.' });
  } catch (error) { next(error); }
});

/**
 * POST /api/admin/refresh-token — Rotate admin JWT using a valid refresh token
 *
 * @body {string} refreshToken - Current refresh token
 *
 * @response 200 { success, data: { token, refreshToken } }
 */
router.post('/refresh-token', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const result = await adminHandler.refreshToken(req.body.refreshToken);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

// ═══════════════ PROTECTED ROUTES (require admin JWT) ═══════════════

router.use(adminAuth);

/**
 * GET /api/admin/users — List all admin accounts
 *
 * @response 200 { success, data: { admins } }
 */
router.get('/users', async (_req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const admins = await adminHandler.listAdmins();
    res.json({ success: true, data: { admins } });
  } catch (error) { next(error); }
});

/**
 * POST /api/admin/users — Create a new admin account
 *
 * @body {string} name     - Display name
 * @body {string} email    - Email address
 * @body {string} password - Password (must pass admin password policy)
 *
 * @response 201 { success, data: { adminId, email, name } }
 */
router.post('/users', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { name, email, password } = req.body;
    const result = await adminHandler.createAdmin(name, email, password, req.adminUser!.adminId);
    logger.info('Admin created new admin', { userId: req.adminUser!.adminId, meta: { newAdminId: result.adminId, email: result.email } });
    res.status(201).json({ success: true, data: result });
  } catch (error) { next(error); }
});

/**
 * DELETE /api/admin/users/:id — Delete an admin account
 *
 * Cannot delete your own account.
 *
 * @param {string} id - Admin user ID to delete
 *
 * @response 200 { success, message }
 */
router.delete('/users/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    await adminHandler.deleteAdmin(req.params.id as string, req.adminUser!.adminId);
    res.json({ success: true, message: 'Admin deleted' });
  } catch (error) { next(error); }
});


/**
 * GET /api/admin/recent-raids — Get last 5 searched RAIDs for the current admin
 *
 * @response 200 { success, data: { raids } }
 */
router.get('/recent-raids', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const raids = await adminHandler.getRecentRaids(req.adminUser!.adminId);
    res.json({ success: true, data: { raids } });
  } catch (error) { next(error); }
});

/**
 * POST /api/admin/recent-raids — Save a RAID search entry
 *
 * Upserts by RAID value; keeps only the 5 most recent entries.
 *
 * @body {string} raid    - RAID identifier
 * @body {string} [label] - Optional display label
 *
 * @response 200 { success }
 */
router.post('/recent-raids', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { raid, label } = req.body;
    if (!raid) throw new ValidationError('RAID is required');
    await adminHandler.saveRecentRaid(req.adminUser!.adminId, raid, label);
    res.json({ success: true });
  } catch (error) { next(error); }
});

export default router;
