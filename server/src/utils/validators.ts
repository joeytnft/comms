import { ValidationError } from './errors';

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

/**
 * Enforce password rules. Length floor is 12 chars; we also require at least
 * three of the four NIST character classes so callers can't pass "aaaaaaaaaaaa".
 * Throw ValidationError on failure so all routes get a consistent 400 response.
 */
export function assertStrongPassword(password: string): void {
  if (typeof password !== 'string') {
    throw new ValidationError('Password is required');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classes < 3) {
    throw new ValidationError(
      'Password must include at least three of: lowercase, uppercase, number, symbol',
    );
  }
}

/**
 * Public-key column input. We only persist what the client sends so we cannot
 * rely on its semantic correctness, but we can cap size and reject obviously
 * malicious payloads (binary, very long, or empty strings) at the boundary.
 */
const MIN_PUBLIC_KEY_LENGTH = 32;
const MAX_PUBLIC_KEY_LENGTH = 4096;

export function assertValidPublicKey(publicKey: string): void {
  if (typeof publicKey !== 'string') {
    throw new ValidationError('publicKey must be a string');
  }
  if (publicKey.length < MIN_PUBLIC_KEY_LENGTH) {
    throw new ValidationError('publicKey is too short');
  }
  if (publicKey.length > MAX_PUBLIC_KEY_LENGTH) {
    throw new ValidationError('publicKey is too long');
  }
  // Accept PEM, base64, base64url, or hex. Reject control chars and embedded
  // nulls so the value is safe to log and round-trip through JSON.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0E-\x1F\x7F]/.test(publicKey)) {
    throw new ValidationError('publicKey contains invalid characters');
  }
}

/**
 * Validate an https:// URL belongs to an allowlisted host. Used at trust
 * boundaries where the client supplies a URL that the server will later serve
 * to other tenants (e.g. incident photo URLs).
 */
export function assertAllowedHttpsUrl(url: string, allowedHosts: string[]): void {
  if (typeof url !== 'string' || url.length === 0) {
    throw new ValidationError('URL is required');
  }
  if (url.length > 2048) {
    throw new ValidationError('URL is too long');
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('URL is malformed');
  }
  if (parsed.protocol !== 'https:') {
    throw new ValidationError('URL must use https');
  }
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new ValidationError('URL host is not permitted');
  }
}
