import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Platform-aware secure storage.
 * Uses expo-secure-store on native (iOS/Android).
 * Web platform uses sessionStorage (tab-scoped, dev/testing only — not cryptographically secure).
 */

const isWeb = Platform.OS === 'web';

export const secureStorage = {
  async getItemAsync(key: string): Promise<string | null> {
    if (isWeb) return sessionStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },

  async setItemAsync(key: string, value: string): Promise<void> {
    if (isWeb) { sessionStorage.setItem(key, value); return; }
    return SecureStore.setItemAsync(key, value);
  },

  async deleteItemAsync(key: string): Promise<void> {
    if (isWeb) { sessionStorage.removeItem(key); return; }
    return SecureStore.deleteItemAsync(key);
  },
};
