import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import logger from '../Logger';

// Routes that don't require JWT authentication
const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/refresh-token' },
  { method: 'POST', path: '/api/auth/verify-otp' },
  { method: 'POST', path: '/api/auth/resend-otp' },
  { method: 'POST', path: '/api/admin/login' },
  { method: 'POST', path: '/api/admin/verify-otp' },
  { method: 'POST', path: '/api/admin/resend-otp' },
  { method: 'POST', path: '/api/admin/refresh-token' },
  { method: 'POST', path: '/api/admin/bootstrap' },
];

function isPublicRoute(method: string, path: string): boolean {
  return PUBLIC_ROUTES.some(r => r.method === method && path.startsWith(r.path));
}

export function jwtAuth(req: Request, res: Response, next: NextFunction): void {
  // Health endpoints are always public
  if (req.path === '/health' || req.path === '/ready') return next();

  // Check if this is a public route
  if (isPublicRoute(req.method, req.path)) return next();

  // Admin routes — admin-server handles its own JWT auth, just pass through
  if (req.path.startsWith('/api/admin')) return next();

  // Allow internal service-to-service calls (e.g. notification creation from ai-server/document-server)
  const serviceAuth = req.headers['x-service-auth'] as string;
  if (serviceAuth === 'internal' && config.s2sToken.secret && req.headers['x-user-id']) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const tokenFromQuery = req.query.token as string | undefined;
  if (!authHeader?.startsWith('Bearer ') && !tokenFromQuery) {
    logger.warn('Missing auth token', { path: req.path, method: req.method, ip: req.ip });
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const token = tokenFromQuery || authHeader!.substring(7);
  try {
    const decoded = jwt.verify(token, config.jwtToken.secret) as any;
    // Inject user context as headers for downstream services
    const userId = decoded.id || decoded.userId || decoded.adminId;
    if (userId) req.headers['x-user-id'] = userId;
    if (decoded.email) req.headers['x-user-email'] = decoded.email;
    if (decoded.name) req.headers['x-user-name'] = decoded.name;
    req.headers['x-user-role'] = decoded.type === 'admin' ? 'admin' : (decoded.role || 'user');
    next();
  } catch (err) {
    logger.warn('Invalid JWT token', { path: req.path, method: req.method, ip: req.ip });
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}
