import crypto from 'crypto';

export function generateIdempotencyKey(...parts: string[]) {
  return crypto.createHash('sha256').update(parts.join(':')).digest('hex');
}

/**
 * Validate admin password strength — stricter than regular users.
 * Requires: 12+ chars, uppercase, lowercase, number, special character.
 */
export function validateAdminPassword(password: string): { valid: boolean; reason?: string } {
  if (!password || password.length < 12) {
    return { valid: false, reason: 'Password must be at least 12 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one number' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one special character' };
  }
  return { valid: true };
}
