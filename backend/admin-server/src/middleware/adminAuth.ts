import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';

export interface AdminRequest extends Request {
  adminUser?: { adminId: string; email: string; name: string; role: string };
}

/**
 * Middleware that validates admin JWT tokens.
 * Rejects any token that doesn't have type === 'admin'.
 */
export function adminAuth(req: AdminRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Admin authentication required' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.jwtToken.secret) as any;

    // Reject non-admin tokens — prevents regular user tokens from accessing admin routes
    if (decoded.type !== 'admin') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }

    req.adminUser = {
      adminId: decoded.adminId,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired admin token' });
  }
}
