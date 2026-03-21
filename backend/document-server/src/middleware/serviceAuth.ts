import { Request, Response, NextFunction } from 'express';

export interface ServiceUser {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: ServiceUser;
}

export const serviceAuth = (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  const userId = req.headers['x-user-id'] as string;
  const email = req.headers['x-user-email'] as string;
  const name = req.headers['x-user-name'] as string;
  const role = req.headers['x-user-role'] as string;
  if (userId) req.user = { userId, email, name, role };
  next();
};
