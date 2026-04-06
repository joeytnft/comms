import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Platform-aware secure storage.
 * Uses expo-secure-store on native (iOS/Android).
 * Web platform is NOT supported for secure token storage — throws an error.
 */

const isWeb = Platform.OS === 'web';

function assertNativeOnly(): void {
  if (isWeb) {
    throw new Error(
      'Secure storage is not available on web. ' +
      'Guardian Comm requires a native device (iOS/Android) for secure token storage.',
    );
  }
}

export const secureStorage = {
  async getItemAsync(key: string): Promise<string | null> {
    assertNativeOnly();
    return SecureStore.getItemAsync(key);
  },

  async setItemAsync(key: string, value: string): Promise<void> {
    assertNativeOnly();
    return SecureStore.setItemAsync(key, value);
  },

  async deleteItemAsync(key: string): Promise<void> {
    assertNativeOnly();
    return SecureStore.deleteItemAsync(key);
  },
};
