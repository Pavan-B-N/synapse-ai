import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

class RequestContext {
  static middleware(req: Request, res: Response, next: NextFunction): void {
    const rootActivityId = (req.headers['x-raid'] as string) || uuidv4();
    req.headers['x-raid'] = rootActivityId;
    req.headers['x-request-id'] = req.headers['x-request-id'] || rootActivityId;
    res.setHeader('x-raid', rootActivityId);
    next();
  }
}

export default RequestContext;
