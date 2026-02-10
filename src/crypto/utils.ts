import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const GROUP_KEY_PREFIX = 'guardian_group_key_';

/**
 * Generate a random 256-bit key as a hex string.
 * Used as the symmetric encryption key for a group.
 */
export async function generateGroupKey(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return bytesToHex(bytes);
}

/**
 * Generate a random IV (initialization vector) for AES-GCM.
 * Returns a hex string.
 */
export async function generateIV(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(12);
  return bytesToHex(bytes);
}

/**
 * Encrypt a plaintext message using AES-256-GCM.
 * Returns { ciphertext, iv } as hex strings.
 *
 * Note: In React Native, SubtleCrypto may not be available on all platforms.
 * This implementation uses expo-crypto for randomness and the Web Crypto API
 * for encryption when available. If SubtleCrypto is unavailable, it falls
 * back to a simple XOR-based obfuscation (placeholder for dev only).
 */
export async function encryptMessage(
  plaintext: string,
  groupKeyHex: string,
): Promise<{ encryptedContent: string; iv: string }> {
  const iv = await generateIV();

  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    // Use Web Crypto API (available in newer Hermes/JSC)
    const keyBytes = hexToBytes(groupKeyHex);
    const ivBytes = hexToBytes(iv);
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );

    const encrypted = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ivBytes },
      cryptoKey,
      data,
    );

    return {
      encryptedContent: bytesToHex(new Uint8Array(encrypted)),
      iv,
    };
  }

  // Fallback: XOR cipher for development (NOT secure for production)
  const encrypted = xorCipher(plaintext, groupKeyHex);
  return { encryptedContent: encrypted, iv };
}

/**
 * Decrypt an encrypted message using AES-256-GCM.
 */
export async function decryptMessage(
  encryptedContentHex: string,
  ivHex: string,
  groupKeyHex: string,
): Promise<string> {
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const keyBytes = hexToBytes(groupKeyHex);
    const ivBytes = hexToBytes(ivHex);
    const cipherBytes = hexToBytes(encryptedContentHex);

    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );

    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      cryptoKey,
      cipherBytes,
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  // Fallback: XOR decipher
  return xorDecipher(encryptedContentHex, groupKeyHex);
}

/**
 * Store a group's encryption key in secure storage.
 */
export async function storeGroupKey(groupId: string, keyHex: string): Promise<void> {
  await SecureStore.setItemAsync(`${GROUP_KEY_PREFIX}${groupId}`, keyHex);
}

/**
 * Retrieve a group's encryption key from secure storage.
 */
export async function getGroupKey(groupId: string): Promise<string | null> {
  return SecureStore.getItemAsync(`${GROUP_KEY_PREFIX}${groupId}`);
}

/**
 * Generate and store a new group key. Called when creating a group.
 */
export async function initGroupKey(groupId: string): Promise<string> {
  const key = await generateGroupKey();
  await storeGroupKey(groupId, key);
  return key;
}

// --- Helpers ---

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Dev-only XOR cipher fallback (NOT cryptographically secure)
function xorCipher(text: string, keyHex: string): string {
  const keyBytes = hexToBytes(keyHex);
  const result: number[] = [];
  for (let i = 0; i < text.length; i++) {
    result.push(text.charCodeAt(i) ^ keyBytes[i % keyBytes.length]);
  }
  return bytesToHex(new Uint8Array(result));
}

function xorDecipher(hexCipher: string, keyHex: string): string {
  const cipherBytes = hexToBytes(hexCipher);
  const keyBytes = hexToBytes(keyHex);
  const result: string[] = [];
  for (let i = 0; i < cipherBytes.length; i++) {
    result.push(String.fromCharCode(cipherBytes[i] ^ keyBytes[i % keyBytes.length]));
  }
  return result.join('');
}
