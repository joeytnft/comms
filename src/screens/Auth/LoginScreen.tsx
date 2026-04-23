import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/common/Logo';
import { biometricAuth, BiometricType } from '@/utils/biometricAuth';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';

export function LoginScreen({ navigation }: { navigation: any }) {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [biometricType, setBiometricType] = useState<BiometricType>(null);
  const [loginBiometricEnabled, setLoginBiometricEnabled] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [available, enabled, type] = await Promise.all([
        biometricAuth.isAvailable(),
        biometricAuth.isLoginBiometricEnabled(),
        biometricAuth.getType(),
      ]);
      if (available && enabled) {
        setLoginBiometricEnabled(true);
        setBiometricType(type);
      } else if (available) {
        setBiometricType(type);
      }
    })();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }
    try {
      await login({ email: email.trim(), password });
      // Offer to enable Face ID after first successful manual login
      const available = await biometricAuth.isAvailable();
      if (available && !loginBiometricEnabled && biometricType) {
        const label = biometricType === 'faceId' ? 'Face ID' : 'Touch ID';
        Alert.alert(
          `Enable ${label}`,
          `Sign in faster next time using ${label}. Your credentials are stored securely on this device.`,
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: `Enable ${label}`,
              onPress: async () => {
                const ok = await biometricAuth.authenticate(`Confirm ${label} to enable login`);
                if (ok) {
                  await biometricAuth.saveLoginCredentials(email.trim(), password);
                  setLoginBiometricEnabled(true);
                }
              },
            },
          ],
        );
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Please check your credentials.';
      Alert.alert('Login Failed', message);
    }
  };

  const handleBiometricLogin = useCallback(async () => {
    if (biometricLoading) return;
    setBiometricLoading(true);
    try {
      const label = biometricType === 'faceId' ? 'Face ID' : 'Touch ID';
      const ok = await biometricAuth.authenticate(`Use ${label} to sign in to GatherSafe`);
      if (!ok) return;
      const credentials = await biometricAuth.getLoginCredentials();
      if (!credentials) {
        Alert.alert('Setup needed', 'Please sign in with your password to re-enable biometric login.');
        await biometricAuth.clearLoginCredentials();
        setLoginBiometricEnabled(false);
        return;
      }
      await login(credentials);
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Biometric login failed. Please use your password.';
      Alert.alert('Login Failed', message);
    } finally {
      setBiometricLoading(false);
    }
  }, [biometricLoading, biometricType, login]);

  const biometricLabel = biometricType === 'faceId' ? 'Face ID' : 'Touch ID';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Logo size={80} />
          <Text style={styles.title}>GatherSafe</Text>
          <Text style={styles.subtitle}>Secure Team Communication</Text>
        </View>

        {loginBiometricEnabled && biometricType ? (
          <View style={styles.form}>
            <TouchableOpacity
              style={[styles.biometricButton, biometricLoading && styles.buttonDisabled]}
              onPress={handleBiometricLogin}
              disabled={biometricLoading || isLoading}
            >
              <Text style={styles.biometricIcon}>{biometricType === 'faceId' ? '🔐' : '👆'}</Text>
              <Text style={styles.biometricButtonText}>
                {biometricLoading || isLoading ? 'Signing in...' : `Sign in with ${biometricLabel}`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.usePasswordButton}
              onPress={() => setLoginBiometricEnabled(false)}
            >
              <Text style={styles.usePasswordText}>Use password instead</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('Register')}
            >
              <Text style={styles.linkText}>
                Don&apos;t have an account?{' '}
                <Text style={styles.linkTextBold}>Register</Text>
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={COLORS.gray500}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={COLORS.gray500}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              <Text style={styles.buttonText}>{isLoading ? 'Signing in...' : 'Sign In'}</Text>
            </TouchableOpacity>

            {biometricType && !loginBiometricEnabled && (
              <TouchableOpacity
                style={styles.forgotButton}
                onPress={() => navigation.navigate('ForgotPassword')}
              >
                <Text style={styles.forgotText}>Forgot your password?</Text>
              </TouchableOpacity>
            )}

            {!biometricType && (
              <TouchableOpacity
                style={styles.forgotButton}
                onPress={() => navigation.navigate('ForgotPassword')}
              >
                <Text style={styles.forgotText}>Forgot your password?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('Register')}
            >
              <Text style={styles.linkText}>
                Don&apos;t have an account?{' '}
                <Text style={styles.linkTextBold}>Register</Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('AcceptInvite')}
            >
              <Text style={styles.linkText}>
                Have an invite?{' '}
                <Text style={styles.linkTextBold}>Activate Account</Text>
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  title: {
    ...TYPOGRAPHY.heading1,
    color: COLORS.textPrimary,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  form: {
    gap: SPACING.md,
  },
  inputContainer: {
    gap: SPACING.xs,
  },
  label: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.gray700,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.white,
  },
  biometricButton: {
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  biometricIcon: {
    fontSize: 22,
  },
  biometricButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.white,
  },
  usePasswordButton: {
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  usePasswordText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.info,
  },
  forgotButton: {
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  forgotText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.info,
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  linkText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  linkTextBold: {
    color: COLORS.info,
    fontWeight: '600',
  },
});
