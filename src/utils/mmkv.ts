import { MMKV } from 'react-native-mmkv';
import { Platform } from 'react-native';

// Shared MMKV instance for non-sensitive general-purpose storage.
// (Sensitive data like tokens still uses expo-secure-store via secureStorage.)

let _storage: MMKV | null = null;

function getStorage(): MMKV | null {
  if (Platform.OS === 'web') return null; // MMKV is native-only
  if (!_storage) {
    _storage = new MMKV({ id: 'guardian-comm-storage' });
  }
  return _storage;
}

export const mmkvStorage = {
  getString(key: string): string | undefined {
    return getStorage()?.getString(key);
  },
  setString(key: string, value: string): void {
    getStorage()?.set(key, value);
  },
  delete(key: string): void {
    getStorage()?.delete(key);
  },
};
