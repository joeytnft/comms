import * as LocalAuthentication from 'expo-local-authentication';
import { secureStorage } from '@/utils/secureStorage';

const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';

export type BiometricType = 'faceId' | 'touchId' | 'fingerprint' | null;

export const biometricAuth = {
  async isAvailable(): Promise<boolean> {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  },

  async getType(): Promise<BiometricType> {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'faceId';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      // iOS reports Touch ID as FINGERPRINT
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      return level !== LocalAuthentication.SecurityLevel.NONE ? 'touchId' : 'fingerprint';
    }
    return null;
  },

  async authenticate(reason: string): Promise<boolean> {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Use PIN',
      cancelLabel: 'Cancel',
      disableDeviceFallback: true,
    });
    return result.success;
  },

  async isEnabled(): Promise<boolean> {
    const val = await secureStorage.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return val === 'true';
  },

  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      await secureStorage.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
    } else {
      await secureStorage.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
    }
  },
};
