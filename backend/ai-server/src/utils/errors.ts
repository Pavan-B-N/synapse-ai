export class AppError extends Error {
  statusCode: number; code: string; isOperational: boolean;
  constructor(message: string, statusCode: number, code: string = 'INTERNAL_ERROR') {
    super(message); this.statusCode = statusCode; this.code = code; this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
export class ValidationError extends AppError { constructor(m: string) { super(m, 400, 'VALIDATION_ERROR'); } }
export class NotFoundError extends AppError { constructor(r: string = 'Resource') { super(`${r} not found`, 404, 'NOT_FOUND'); } }
export class ForbiddenError extends AppError { constructor(m: string = 'Forbidden') { super(m, 403, 'FORBIDDEN'); } }
export class AIServiceError extends AppError { constructor(m: string = 'AI service unavailable') { super(m, 503, 'AI_SERVICE_ERROR'); } }
