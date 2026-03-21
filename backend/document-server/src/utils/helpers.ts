import crypto from 'crypto';

export async function withRetry(fn: () => Promise<any>, options: any = {}) {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await fn(); } catch (error: any) {
      if (attempt === maxRetries) throw error;
      await new Promise((r) => setTimeout(r, Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)));
    }
  }
}

export function generateIdempotencyKey(...parts: string[]) {
  return crypto.createHash('sha256').update(parts.join(':')).digest('hex');
}
