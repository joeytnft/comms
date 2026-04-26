import * as LocalAuthentication from 'expo-local-authentication';
import { secureStorage } from '@/utils/secureStorage';

const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
// Separate keys for login-level biometric (stores credentials vs app-lock biometric)
const LOGIN_BIOMETRIC_ENABLED_KEY = 'login_biometric_enabled';
const LOGIN_BIOMETRIC_EMAIL_KEY = 'login_biometric_email';
const LOGIN_BIOMETRIC_PASSWORD_KEY = 'login_biometric_password';

export type BiometricType = 'faceId' | 'touchId' | 'fingerprint' | null;

export const biometricAuth = {
  async isAvailable(): Promise<boolean> {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  },

  // Returns the biometric type the device hardware supports, regardless of
  // whether the user has enrolled or granted the app permission.  Used to
  // keep the Face ID / Touch ID settings row visible even after a denial.
  async hasHardwareType(): Promise<BiometricType> {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return null;
    return biometricAuth.getType();
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

  // ── Login-level biometric (saves email+password for auto-login) ──────────

  async isLoginBiometricEnabled(): Promise<boolean> {
    const val = await secureStorage.getItemAsync(LOGIN_BIOMETRIC_ENABLED_KEY);
    return val === 'true';
  },

  async saveLoginCredentials(email: string, password: string): Promise<void> {
    await secureStorage.setItemAsync(LOGIN_BIOMETRIC_ENABLED_KEY, 'true');
    await secureStorage.setItemAsync(LOGIN_BIOMETRIC_EMAIL_KEY, email);
    await secureStorage.setItemAsync(LOGIN_BIOMETRIC_PASSWORD_KEY, password);
  },

  async getLoginCredentials(): Promise<{ email: string; password: string } | null> {
    const email = await secureStorage.getItemAsync(LOGIN_BIOMETRIC_EMAIL_KEY);
    const password = await secureStorage.getItemAsync(LOGIN_BIOMETRIC_PASSWORD_KEY);
    if (!email || !password) return null;
    return { email, password };
  },

  async clearLoginCredentials(): Promise<void> {
    await secureStorage.deleteItemAsync(LOGIN_BIOMETRIC_ENABLED_KEY);
    await secureStorage.deleteItemAsync(LOGIN_BIOMETRIC_EMAIL_KEY);
    await secureStorage.deleteItemAsync(LOGIN_BIOMETRIC_PASSWORD_KEY);
  },
};
