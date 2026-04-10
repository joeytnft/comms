/**
 * PIN Lock utility
 *
 * Stores a SHA-256 hash of the user's PIN in expo-secure-store.
 * We never store the raw PIN — only its hash.
 */

import * as Crypto from 'expo-crypto';
import { secureStorage } from '@/utils/secureStorage';
import { PIN_KEY } from '@/config/constants';

const PIN_HASH_KEY = `${PIN_KEY}_hash`;

async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}

export const pinLock = {
  /** Save a new PIN (stores its SHA-256 hash). */
  async setPin(pin: string): Promise<void> {
    const hash = await hashPin(pin);
    await secureStorage.setItemAsync(PIN_HASH_KEY, hash);
  },

  /** Remove the stored PIN (disables app lock). */
  async clearPin(): Promise<void> {
    await secureStorage.deleteItemAsync(PIN_HASH_KEY);
  },

  /** Returns true if a PIN has been configured. */
  async isPinSet(): Promise<boolean> {
    const stored = await secureStorage.getItemAsync(PIN_HASH_KEY);
    return !!stored;
  },

  /** Returns true if the entered PIN matches the stored hash. */
  async verifyPin(pin: string): Promise<boolean> {
    const stored = await secureStorage.getItemAsync(PIN_HASH_KEY);
    if (!stored) return true; // No PIN set — always unlocked
    const hash = await hashPin(pin);
    return hash === stored;
  },
};
