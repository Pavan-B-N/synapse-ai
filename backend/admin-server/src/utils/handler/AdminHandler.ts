import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import AdminUser from '../../models/AdminUser';
import AdminOTP from '../../models/AdminOTP';
import RecentRaid from '../../models/RecentRaid';
import config from '../../config';
import { ValidationError, AuthenticationError, ForbiddenError } from '../errors';
import { generateIdempotencyKey, validateAdminPassword } from '../helpers';
import { emailService } from '../email';
import logger from '../../Logger';

const MAX_RECENT_RAIDS = 5;

async function generateOTP(): Promise<{ plain: string; hash: string; expiresAt: Date }> {
  // 8-digit OTP — stricter than regular 6-digit
  const plain = crypto.randomInt(10000000, 99999999).toString();
  const hash = await bcrypt.hash(plain, 10);
  const expiresAt = new Date(Date.now() + config.admin.otpExpiryMinutes * 60 * 1000);
  return { plain, hash, expiresAt };
}

function issueAdminTokens(admin: any): { token: string; refreshToken: string } {
  const token = jwt.sign(
    { adminId: admin._id.toString(), email: admin.email, name: admin.name, role: admin.role, type: 'admin' },
    config.jwtToken.secret,
    { expiresIn: config.jwtToken.expiresIn as any },
  );
  const refreshToken = jwt.sign(
    { adminId: admin._id.toString(), type: 'admin-refresh' },
    config.jwtToken.secret,
    { expiresIn: config.jwtToken.refreshExpiresIn as any },
  );
  return { token, refreshToken };
}

class AdminHandler {
  /**
   * Create a new admin account.
   * - If no admins exist yet, allows creation without auth (seed/bootstrap).
   * - Otherwise, requires an authenticated admin (creatorId).
   */
  async createAdmin(name: string, email: string, password: string, creatorId?: string) {
    if (!name || !email || !password) {
      throw new ValidationError('Name, email, and password are required');
    }

    // Strict password validation
    const pwCheck = validateAdminPassword(password);
    if (!pwCheck.valid) throw new ValidationError(pwCheck.reason!);

    const normalizedEmail = email.toLowerCase().trim();

    // Check if any admins exist (for bootstrap scenario)
    const adminCount = await AdminUser.countDocuments();
    if (adminCount > 0 && !creatorId) {
      throw new ForbiddenError('Only existing admins can create new admin accounts');
    }

    logger.info('CreateAdmin: checking existing admin', { meta: { email: normalizedEmail } });
    const existing = await AdminUser.findOne({ email: normalizedEmail });
    if (existing) {
      throw new ValidationError('An admin with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 14); // Higher rounds than regular users (14 vs 12)
    const admin = await AdminUser.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      isVerified: true, // Admin accounts are pre-verified (created by other admins)
      createdBy: creatorId || null,
    });
    logger.info('CreateAdmin: admin created', { userId: (admin._id as any).toString(), meta: { email: normalizedEmail, createdBy: creatorId || 'bootstrap' } });

    return { adminId: (admin._id as any).toString(), email: normalizedEmail, name: admin.name };
  }

  async login(email: string, password: string) {
    if (!email || !password) throw new ValidationError('Email and password are required');

    const normalizedEmail = email.toLowerCase().trim();
    logger.info('AdminLogin: looking up admin', { meta: { email: normalizedEmail } });

    const admin = await AdminUser.findOne({ email: normalizedEmail });
    if (!admin) {
      logger.warn('AdminLogin: admin not found', { meta: { email: normalizedEmail } });
      throw new AuthenticationError('Invalid credentials');
    }

    // Check account lockout
    if ((admin as any).lockUntil && new Date() < (admin as any).lockUntil) {
      const remainingMs = (admin as any).lockUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      logger.warn('AdminLogin: account locked', { userId: (admin._id as any).toString(), meta: { email: normalizedEmail, lockedForMinutes: remainingMin } });
      throw new AuthenticationError(`Account locked. Try again in ${remainingMin} minutes.`);
    }

    const isMatch = await bcrypt.compare(password, (admin as any).password);
    if (!isMatch) {
      // Increment failed attempts
      const attempts = ((admin as any).failedLoginAttempts || 0) + 1;
      const update: any = { failedLoginAttempts: attempts };
      if (attempts >= config.admin.maxFailedAttempts) {
        update.lockUntil = new Date(Date.now() + config.admin.lockDurationMinutes * 60 * 1000);
        logger.warn('AdminLogin: account locked due to failed attempts', { userId: (admin._id as any).toString(), meta: { email: normalizedEmail, attempts } });
      }
      await AdminUser.findByIdAndUpdate(admin._id, update);
      logger.warn('AdminLogin: invalid password', { userId: (admin._id as any).toString(), meta: { email: normalizedEmail, failedAttempts: attempts } });
      throw new AuthenticationError('Invalid credentials');
    }

    // Reset failed attempts on successful password match
    await AdminUser.findByIdAndUpdate(admin._id, { failedLoginAttempts: 0, lockUntil: null });

    const { plain, hash, expiresAt } = await generateOTP();
    await AdminOTP.findOneAndUpdate({ userId: admin._id }, { hash, purpose: 'login', expiresAt }, { upsert: true });
    logger.info('AdminLogin: OTP generated, sending email', { userId: (admin._id as any).toString(), meta: { email: normalizedEmail } });
    await emailService.sendOTP(normalizedEmail, plain, 'login');
    logger.info('AdminLogin: OTP sent', { userId: (admin._id as any).toString() });

    return { adminId: (admin._id as any).toString(), email: normalizedEmail, requiresOTP: true };
  }

  async verifyOTP(adminId: string, otp: string) {
    if (!adminId || !otp) throw new ValidationError('Admin ID and OTP are required');

    logger.info('AdminVerifyOTP: looking up admin', { userId: adminId });
    const admin = await AdminUser.findById(adminId);
    if (!admin) throw new AuthenticationError('Admin not found');

    const otpDoc = await AdminOTP.findOne({ userId: admin._id });
    if (!otpDoc) throw new AuthenticationError('No OTP requested. Please login again.');
    if (new Date() > otpDoc.expiresAt!) {
      logger.warn('AdminVerifyOTP: OTP expired', { userId: adminId });
      throw new AuthenticationError('OTP has expired. Please request a new one.');
    }

    const isValid = await bcrypt.compare(otp, otpDoc.hash!);
    if (!isValid) {
      logger.warn('AdminVerifyOTP: invalid OTP', { userId: adminId });
      throw new AuthenticationError('Invalid OTP');
    }

    await AdminOTP.deleteOne({ _id: otpDoc._id });
    const { token, refreshToken } = issueAdminTokens(admin);
    const refreshHash = generateIdempotencyKey(refreshToken);

    await AdminUser.findByIdAndUpdate(admin._id, { lastLogin: new Date(), refreshTokenHash: refreshHash });
    logger.info('AdminVerifyOTP: authentication complete', { userId: adminId });

    return { admin: admin.toJSON(), token, refreshToken };
  }

  async resendOTP(adminId: string) {
    if (!adminId) throw new ValidationError('Admin ID is required');

    const admin = await AdminUser.findById(adminId);
    if (!admin) throw new AuthenticationError('Admin not found');

    const { plain, hash, expiresAt } = await generateOTP();
    await AdminOTP.findOneAndUpdate({ userId: admin._id }, { hash, purpose: 'login', expiresAt }, { upsert: true });
    logger.info('AdminResendOTP: sending OTP', { userId: adminId });
    await emailService.sendOTP((admin as any).email, plain, 'login');
  }

  async refreshToken(refreshToken: string) {
    if (!refreshToken) throw new ValidationError('Refresh token is required');

    let decoded: any;
    try { decoded = jwt.verify(refreshToken, config.jwtToken.secret); }
    catch { throw new AuthenticationError('Invalid or expired refresh token'); }

    if (decoded.type !== 'admin-refresh') {
      throw new AuthenticationError('Invalid token type');
    }

    const admin = await AdminUser.findById(decoded.adminId);
    if (!admin) throw new AuthenticationError('Admin not found');

    const refreshHash = generateIdempotencyKey(refreshToken);
    if ((admin as any).refreshTokenHash !== refreshHash) {
      throw new AuthenticationError('Refresh token has been revoked');
    }

    const token = jwt.sign(
      { adminId: (admin._id as any).toString(), email: (admin as any).email, name: (admin as any).name, role: (admin as any).role, type: 'admin' },
      config.jwtToken.secret,
      { expiresIn: config.jwtToken.expiresIn as any },
    );
    const newRefreshToken = jwt.sign(
      { adminId: (admin._id as any).toString(), type: 'admin-refresh' },
      config.jwtToken.secret,
      { expiresIn: config.jwtToken.refreshExpiresIn as any },
    );
    const newRefreshHash = generateIdempotencyKey(newRefreshToken);
    await AdminUser.findByIdAndUpdate(admin._id, { refreshTokenHash: newRefreshHash });

    return { token, refreshToken: newRefreshToken };
  }

  async listAdmins() {
    const admins = await AdminUser.find().select('-password -refreshTokenHash').sort({ createdAt: -1 }).lean();
    return admins;
  }

  async deleteAdmin(adminId: string, requesterId: string) {
    if (adminId === requesterId) throw new ValidationError('Cannot delete your own account');
    const admin = await AdminUser.findById(adminId);
    if (!admin) throw new AuthenticationError('Admin not found');
    await AdminOTP.deleteMany({ userId: admin._id });
    await RecentRaid.deleteMany({ adminUserId: admin._id });
    await AdminUser.findByIdAndDelete(adminId);
    logger.info('DeleteAdmin: admin deleted', { userId: adminId, meta: { deletedBy: requesterId } });
  }

  // ── Recent RAIDs ──

  async saveRecentRaid(adminUserId: string, raid: string, label?: string) {
    // Upsert: if this RAID already exists for this user, update searchedAt
    await RecentRaid.findOneAndUpdate(
      { adminUserId, raid },
      { searchedAt: new Date(), label: label || '' },
      { upsert: true },
    );

    // Keep only the most recent MAX_RECENT_RAIDS entries
    const all = await RecentRaid.find({ adminUserId }).sort({ searchedAt: -1 }).lean();
    if (all.length > MAX_RECENT_RAIDS) {
      const idsToDelete = all.slice(MAX_RECENT_RAIDS).map((r: any) => r._id);
      await RecentRaid.deleteMany({ _id: { $in: idsToDelete } });
    }
  }

  async getRecentRaids(adminUserId: string) {
    return RecentRaid.find({ adminUserId }).sort({ searchedAt: -1 }).limit(MAX_RECENT_RAIDS).lean();
  }
}

export default new AdminHandler();
