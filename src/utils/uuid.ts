/**
 * Generate an RFC 4122 version 4 UUID using Math.random.
 *
 * Not cryptographically secure — don't use this for tokens or anything
 * that needs to resist guessing. Fine for opaque identifiers like PTT
 * channel UUIDs (where uniqueness matters, predictability doesn't).
 */
export function generateUUIDv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
