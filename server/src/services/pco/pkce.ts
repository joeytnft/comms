import { randomBytes, createHash } from 'crypto';

export function generateVerifier(): string {
  return randomBytes(48).toString('base64url').slice(0, 96);
}

export function deriveChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
