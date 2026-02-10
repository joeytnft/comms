import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Platform-aware secure storage.
 * Uses expo-secure-store on native, localStorage on web.
 */

const isWeb = Platform.OS === 'web';

export const secureStorage = {
  async getItemAsync(key: string): Promise<string | null> {
    if (isWeb) {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },

  async setItemAsync(key: string, value: string): Promise<void> {
    if (isWeb) {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },

  async deleteItemAsync(key: string): Promise<void> {
    if (isWeb) {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};
