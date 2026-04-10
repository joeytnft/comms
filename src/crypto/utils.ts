import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { secureStorage as SecureStore } from '@/utils/secureStorage';
import { ENV } from '@/config/env';
import { ACCESS_TOKEN_KEY } from '@/config/constants';

// v2: bumped to invalidate locally-generated keys from before server-side key sharing
const GROUP_KEY_PREFIX = 'guardian_group_key_v2_';

// Group keys are shared secrets — use localStorage on web so they survive reloads.
// On native, expo-secure-store already persists across sessions.
const groupKeyStorage = {
  async get(groupId: string): Promise<string | null> {
    const k = `${GROUP_KEY_PREFIX}${groupId}`;
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
    }
    return SecureStore.getItemAsync(k);
  },
  async set(groupId: string, key: string): Promise<void> {
    const k = `${GROUP_KEY_PREFIX}${groupId}`;
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(k, key);
      return;
    }
    await SecureStore.setItemAsync(k, key);
  },
};

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

  // Fallback for HTTP (non-secure context) dev environments where crypto.subtle is unavailable.
  // Messages are base64-encoded plaintext — NOT encrypted. Use HTTPS in production.
  const encoder = new TextEncoder();
  const bytes = encoder.encode(plaintext);
  const binary = String.fromCharCode(...bytes);
  return { encryptedContent: 'b64:' + btoa(binary), iv };
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

  // Fallback: decode base64 plaintext (matches the HTTP dev fallback in encryptMessage)
  if (encryptedContentHex.startsWith('b64:')) {
    const binary = atob(encryptedContentHex.slice(4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  throw new Error(
    'Secure decryption unavailable on this platform. Web Crypto API (crypto.subtle) is required.',
  );
}

/**
 * Store a group's encryption key in local storage (persistent across reloads).
 */
export async function storeGroupKey(groupId: string, keyHex: string): Promise<void> {
  await groupKeyStorage.set(groupId, keyHex);
}

/**
 * Retrieve the group key — checks local cache first, then fetches from server.
 * The server generates a shared key on first request and all members get the same key.
 */
export async function getGroupKey(groupId: string): Promise<string | null> {
  // Check local cache first
  const cached = await groupKeyStorage.get(groupId);
  if (cached) return cached;

  // Fetch shared key from server
  try {
    const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    if (!token) return null;
    const res = await fetch(`${ENV.apiUrl}/groups/${groupId}/key`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const { groupKey } = await res.json();
    if (groupKey) {
      await groupKeyStorage.set(groupId, groupKey);
      return groupKey;
    }
  } catch {
    // Network failure — key unavailable
  }
  return null;
}

/**
 * Ensure a group key exists (fetches from server, creates if needed).
 */
export async function initGroupKey(groupId: string): Promise<string> {
  const key = await getGroupKey(groupId);
  if (key) return key;
  // Should not reach here — server always returns a key for valid group members
  throw new Error('Unable to obtain group encryption key');
}

// --- Helpers ---

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

