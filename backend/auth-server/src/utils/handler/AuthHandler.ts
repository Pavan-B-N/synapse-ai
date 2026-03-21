import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../../models/User';
import OTP from '../../models/OTP';
import config from '../../config';
import { ValidationError, AuthenticationError } from '../errors';
import { generateIdempotencyKey } from '../helpers';
import { publisher } from '../publisher';
import { emailService } from '../email';
import logger from '../../Logger';

const OTP_EXPIRY_MINUTES = 5;

async function generateOTP(): Promise<{ plain: string; hash: string; expiresAt: Date }> {
  const plain = crypto.randomInt(100000, 999999).toString();
  const hash = await bcrypt.hash(plain, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  return { plain, hash, expiresAt };
}

function issueTokens(user: any): { token: string; refreshToken: string } {
  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email, name: user.name, role: user.role },
    config.jwtToken.secret,
    { expiresIn: config.jwtToken.expiresIn as any },
  );
  const refreshToken = jwt.sign(
    { userId: user._id.toString(), type: 'refresh' },
    config.jwtToken.secret,
    { expiresIn: config.jwtToken.refreshExpiresIn as any },
  );
  return { token, refreshToken };
}

class AuthHandler {
  async register(name: string, email: string, password: string, raid?: string) {
    if (!name || !email || !password) throw new ValidationError('Name, email, and password are required');
    if (password.length < 6) throw new ValidationError('Password must be at least 6 characters');

    const normalizedEmail = email.toLowerCase().trim();
    logger.info('Register: checking existing user', { raid, meta: { email: normalizedEmail } });
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing && (existing as any).isVerified) {
      logger.warn('Register: email already registered', { raid, meta: { email: normalizedEmail } });
      throw new ValidationError('Email already registered');
    }
    if (existing && !(existing as any).isVerified) {
      logger.info('Register: removing unverified account', { raid, meta: { email: normalizedEmail, oldUserId: existing._id.toString() } });
      await User.findByIdAndDelete(existing._id);
    }

    logger.info('Register: hashing password and creating user', { raid, meta: { email: normalizedEmail } });
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({ name: name.trim(), email: normalizedEmail, password: hashedPassword, isVerified: false });
    logger.info('Register: user created', { raid, userId: (user._id as any).toString(), meta: { email: normalizedEmail } });

    const { plain, hash, expiresAt } = await generateOTP();
    await OTP.findOneAndUpdate({ userId: user._id }, { hash, purpose: 'registration', expiresAt }, { upsert: true });
    logger.info('Register: OTP generated, sending email', { raid, userId: (user._id as any).toString(), meta: { email: normalizedEmail, purpose: 'registration' } });
    await emailService.sendOTP(normalizedEmail, plain, 'registration');
    logger.info('Register: OTP email sent', { raid, userId: (user._id as any).toString(), meta: { email: normalizedEmail } });

    return { userId: (user._id as any).toString(), email: normalizedEmail, requiresOTP: true };
  }

  async login(email: string, password: string, raid?: string) {
    if (!email || !password) throw new ValidationError('Email and password are required');

    const normalizedEmail = email.toLowerCase().trim();
    logger.info('Login: looking up user', { raid, meta: { email: normalizedEmail } });
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      logger.warn('Login: user not found', { raid, meta: { email: normalizedEmail } });
      throw new AuthenticationError('Invalid credentials');
    }
    if (!(user as any).isVerified) {
      logger.warn('Login: account not verified', { raid, userId: (user._id as any).toString(), meta: { email: normalizedEmail } });
      throw new AuthenticationError('Account not verified. Please register again.');
    }

    logger.info('Login: comparing password', { raid, userId: (user._id as any).toString() });
    const isMatch = await bcrypt.compare(password, (user as any).password);
    if (!isMatch) {
      logger.warn('Login: invalid password', { raid, userId: (user._id as any).toString(), meta: { email: normalizedEmail } });
      throw new AuthenticationError('Invalid credentials');
    }

    const { plain, hash, expiresAt } = await generateOTP();
    await OTP.findOneAndUpdate({ userId: user._id }, { hash, purpose: 'login', expiresAt }, { upsert: true });
    logger.info('Login: OTP generated, sending email', { raid, userId: (user._id as any).toString(), meta: { email: normalizedEmail, purpose: 'login' } });
    await emailService.sendOTP(normalizedEmail, plain, 'login');
    logger.info('Login: OTP email sent', { raid, userId: (user._id as any).toString() });

    return { userId: (user._id as any).toString(), email: normalizedEmail, requiresOTP: true };
  }

  async verifyOTP(userId: string, otp: string, raid?: string) {
    if (!userId || !otp) throw new ValidationError('User ID and OTP are required');

    logger.info('VerifyOTP: looking up user', { raid, userId });
    const user = await User.findById(userId);
    if (!user) {
      logger.warn('VerifyOTP: user not found', { raid, userId });
      throw new AuthenticationError('User not found');
    }

    logger.info('VerifyOTP: looking up OTP record', { raid, userId });
    const otpDoc = await OTP.findOne({ userId: user._id });
    if (!otpDoc) {
      logger.warn('VerifyOTP: no OTP record found', { raid, userId });
      throw new AuthenticationError('No OTP requested. Please login again.');
    }
    if (new Date() > otpDoc.expiresAt!) {
      logger.warn('VerifyOTP: OTP expired', { raid, userId });
      throw new AuthenticationError('OTP has expired. Please request a new one.');
    }

    logger.info('VerifyOTP: comparing OTP hash', { raid, userId });
    const isValid = await bcrypt.compare(otp, otpDoc.hash!);
    if (!isValid) {
      logger.warn('VerifyOTP: invalid OTP provided', { raid, userId });
      throw new AuthenticationError('Invalid OTP');
    }

    logger.info('VerifyOTP: OTP valid, deleting OTP record', { raid, userId });
    await OTP.deleteOne({ _id: otpDoc._id });
    const { token, refreshToken } = issueTokens(user);
    const refreshHash = generateIdempotencyKey(refreshToken);

    logger.info('VerifyOTP: issuing JWT tokens, updating user', { raid, userId });
    await User.findByIdAndUpdate(user._id, { isVerified: true, lastLogin: new Date(), refreshTokenHash: refreshHash });
    logger.info('VerifyOTP: authentication complete', { raid, userId });

    return { user: user.toJSON(), token, refreshToken };
  }

  async resendOTP(userId: string, raid?: string) {
    if (!userId) throw new ValidationError('User ID is required');

    logger.info('ResendOTP: looking up user', { raid, userId });
    const user = await User.findById(userId);
    if (!user) throw new AuthenticationError('User not found');

    const { plain, hash, expiresAt } = await generateOTP();
    const purpose = (user as any).isVerified ? 'login' : 'registration';
    await OTP.findOneAndUpdate({ userId: user._id }, { hash, purpose, expiresAt }, { upsert: true });
    logger.info('ResendOTP: sending OTP email', { raid, userId, meta: { purpose } });
    await emailService.sendOTP((user as any).email, plain, purpose);
    logger.info('ResendOTP: OTP email sent', { raid, userId });
  }

  async getProfile(userId: string, raid?: string) {
    if (!userId) throw new AuthenticationError('Not authenticated');
    logger.info('GetProfile: fetching user profile', { raid, userId });
    const user = await User.findById(userId).select('-password');
    if (!user) {
      logger.warn('GetProfile: user not found', { raid, userId });
      throw new AuthenticationError('User not found');
    }
    logger.info('GetProfile: profile retrieved', { raid, userId });
    return user;
  }

  async refreshToken(refreshToken: string, raid?: string) {
    if (!refreshToken) throw new ValidationError('Refresh token is required');

    logger.info('RefreshToken: verifying refresh token', { raid });
    let decoded: any;
    try { decoded = jwt.verify(refreshToken, config.jwtToken.secret); }
    catch {
      logger.warn('RefreshToken: invalid or expired refresh token', { raid });
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    if (decoded.type !== 'refresh') {
      logger.warn('RefreshToken: wrong token type', { raid, userId: decoded.userId });
      throw new AuthenticationError('Invalid token type');
    }

    logger.info('RefreshToken: looking up user', { raid, userId: decoded.userId });
    const user = await User.findById(decoded.userId);
    if (!user) throw new AuthenticationError('User not found');

    const refreshHash = generateIdempotencyKey(refreshToken);
    if ((user as any).refreshTokenHash !== refreshHash) {
      logger.warn('RefreshToken: token has been revoked', { raid, userId: decoded.userId });
      throw new AuthenticationError('Refresh token has been revoked');
    }

    const newToken = jwt.sign(
      { userId: (user._id as any).toString(), email: (user as any).email, name: (user as any).name, role: (user as any).role },
      config.jwtToken.secret,
      { expiresIn: config.jwtToken.expiresIn as any },
    );
    const newRefreshToken = jwt.sign(
      { userId: (user._id as any).toString(), type: 'refresh' },
      config.jwtToken.secret,
      { expiresIn: config.jwtToken.refreshExpiresIn as any },
    );

    const newRefreshHash = generateIdempotencyKey(newRefreshToken);
    await User.findByIdAndUpdate(user._id, { refreshTokenHash: newRefreshHash });
    logger.info('RefreshToken: tokens rotated', { raid, userId: decoded.userId });

    return { token: newToken, refreshToken: newRefreshToken };
  }

  async searchUsers(userId: string, q: string, limit: number = 5, skip: number = 0, raid?: string) {
    if (!userId) throw new AuthenticationError('Not authenticated');
    if (!q || q.length < 2) throw new ValidationError('Search query must be at least 2 characters');

    logger.info('SearchUsers: searching', { raid, userId, meta: { query: q, limit, skip } });
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const filter = {
      _id: { $ne: new mongoose.Types.ObjectId(userId) },
      $or: [{ name: regex }, { email: regex }],
    };
    const [users, total] = await Promise.all([
      User.find(filter).select('name email avatar').skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    logger.info('SearchUsers: found results', { raid, userId, meta: { total, returned: users.length } });
    return { users, total, hasMore: skip + limit < total };
  }

  async batchUsers(userId: string, userIds: string[], raid?: string) {
    if (!userId) throw new AuthenticationError('Not authenticated');
    if (!Array.isArray(userIds) || userIds.length === 0) return { users: [] };

    logger.info('BatchUsers: looking up users', { raid, userId, meta: { count: userIds.length } });
    const ids = userIds.slice(0, 50).map((id: string) => {
      try { return new mongoose.Types.ObjectId(id); } catch { return null; }
    }).filter(Boolean);
    const users = await User.find({ _id: { $in: ids } }).select('name email avatar').lean();
    logger.info('BatchUsers: resolved users', { raid, userId, meta: { requested: ids.length, found: users.length } });
    return { users };
  }

  async updateProfile(userId: string, name?: string, preferences?: any, raid?: string) {
    if (!userId) throw new AuthenticationError('Not authenticated');

    logger.info('UpdateProfile: updating', { raid, userId, meta: { hasName: !!name, hasPreferences: !!preferences } });
    const update: any = {};
    if (name) update.name = name.trim();
    if (preferences) update.preferences = preferences;

    const user = await User.findByIdAndUpdate(userId, update, { new: true }).select('-password');
    if (!user) throw new AuthenticationError('User not found');
    logger.info('UpdateProfile: profile updated', { raid, userId });
    return user;
  }

  async deleteAccount(userId: string, raid?: string) {
    if (!userId) throw new AuthenticationError('Not authenticated');

    logger.warn('DeleteAccount: deleting user', { raid, userId });
    const user = await User.findByIdAndDelete(userId);
    if (!user) throw new AuthenticationError('User not found');
    logger.warn('DeleteAccount: user record deleted', { raid, userId, meta: { email: (user as any).email } });

    logger.info('DeleteAccount: publishing account-deleted event to Service Bus', { raid, userId });
    const published = await publisher.publish('account-deleted', {
      userId, email: (user as any).email, deletedAt: new Date().toISOString(),
    }, 'AccountDeleted').then(() => true).catch(() => false);

    if (published) {
      logger.info('DeleteAccount: Service Bus event published', { raid, userId });
    } else {
      logger.warn('DeleteAccount: Service Bus unavailable, running direct cleanup', { raid, userId });
    }

    if (!config.serviceBus.connectionString || !published) {
      await this.directAccountCleanup(userId, raid);
    }
    logger.warn('DeleteAccount: account deletion complete', { raid, userId });
  }

  private async directAccountCleanup(userId: string, raid?: string): Promise<void> {
    logger.info('DirectCleanup: starting cascade delete', { raid, userId });
    const oid = new mongoose.Types.ObjectId(userId);
    const db = mongoose.connection.db!;

    logger.info('DirectCleanup: finding owned resources', { raid, userId });
    const [ownedChannels, ownedGroups, ownedDocs] = await Promise.all([
      db.collection('channels').find({ adminId: oid }, { projection: { _id: 1 } }).toArray(),
      db.collection('docgroups').find({ userId: oid }, { projection: { _id: 1 } }).toArray(),
      db.collection('documents').find({ userId: oid }, { projection: { _id: 1, filePath: 1 } }).toArray(),
    ]);
    const ownedChannelIds = ownedChannels.map(c => c._id);
    const ownedGroupIds = ownedGroups.map(g => g._id);
    const ownedDocIds = ownedDocs.map(d => d._id);
    logger.info('DirectCleanup: owned resources found', { raid, userId, meta: { channels: ownedChannelIds.length, groups: ownedGroupIds.length, docs: ownedDocIds.length } });

    await Promise.all([
      db.collection('documents').deleteMany({ userId: oid }),
      db.collection('documents').updateMany({ sharedWith: oid }, { $pull: { sharedWith: oid } as any }),
      ...(ownedDocIds.length > 0 ? [
        db.collection('documentcontents').deleteMany({ documentId: { $in: ownedDocIds } }),
        db.collection('documentsummaries').deleteMany({ documentId: { $in: ownedDocIds } }),
      ] : []),
      db.collection('queryhistories').deleteMany({ userId: oid }),
      db.collection('queryhistories').updateMany({ sharedWith: oid }, { $pull: { sharedWith: oid } as any }),
      ...(ownedChannelIds.length > 0 ? [
        db.collection('channels').deleteMany({ adminId: oid }),
        db.collection('channelposts').deleteMany({ channelId: { $in: ownedChannelIds } }),
      ] : []),
      db.collection('channels').updateMany({ 'members.userId': oid }, { $pull: { members: { userId: oid } } as any, $inc: { memberCount: -1 } }),
      db.collection('channels').updateMany({ 'joinRequests.userId': oid }, { $pull: { joinRequests: { userId: oid } } as any }),
      db.collection('channelposts').deleteMany({ authorId: oid, ...(ownedChannelIds.length > 0 ? { channelId: { $nin: ownedChannelIds } } : {}) }),
      db.collection('channelposts').updateMany({ $or: [{ likes: oid }, { dislikes: oid }] }, { $pull: { likes: oid, dislikes: oid } as any }),
      db.collection('channelposts').updateMany({ 'comments.userId': oid }, { $pull: { comments: { userId: oid } } as any }),
      db.collection('notifications').deleteMany({ userId: oid }),
      db.collection('quizzes').deleteMany({ userId: oid }),
      db.collection('workspacemessages').deleteMany({ userId: oid }),
      ...(ownedGroupIds.length > 0 ? [
        db.collection('workspacemessages').deleteMany({ workspaceId: { $in: ownedGroupIds } }),
      ] : []),
      db.collection('docgroups').deleteMany({ userId: oid }),
      db.collection('docgroups').updateMany({ 'members.userId': oid }, { $pull: { members: { userId: oid } } as any }),
      ...(ownedGroupIds.length > 0 ? [
        db.collection('channels').updateMany({ attachedWorkspaces: { $in: ownedGroupIds } }, { $pull: { attachedWorkspaces: { $in: ownedGroupIds } } as any }),
      ] : []),
      db.collection('eventlogs').deleteMany({ $or: [{ userId }, { userId: oid }] }),
      db.collection('logentries').deleteMany({ $or: [{ userId }, { userId: oid }] }),
    ]);
    logger.info('DirectCleanup: bulk database cleanup done', { raid, userId });

    const fs = require('fs');
    let filesDeleted = 0;
    for (const doc of ownedDocs) {
      try { if (doc.filePath && fs.existsSync(doc.filePath)) { fs.unlinkSync(doc.filePath); filesDeleted++; } } catch {}
    }
    logger.info('DirectCleanup: file cleanup complete', { raid, userId, meta: { filesDeleted } });
  }
}

export default new AuthHandler();
