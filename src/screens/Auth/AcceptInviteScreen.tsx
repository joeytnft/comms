import React, { useState } from 'react';
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
import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { useAuthStore } from '@/store/useAuthStore';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';

export function AcceptInviteScreen({ navigation, route }: { navigation: any; route: any }) {
  const [token, setToken] = useState<string>(route?.params?.token ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();

  const handleAccept = async () => {
    if (!token.trim()) {
      Alert.alert('Error', 'Please enter or paste your invite code.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { user, tokens } = await apiClient.post<{
        user: { id: string; email: string; displayName: string; organizationId: string; campusId: string | null };
        tokens: { accessToken: string; refreshToken: string };
      }>(ENDPOINTS.AUTH.ACCEPT_INVITE, { token: token.trim(), password });

      // Log in immediately with the returned tokens
      await login(user.email, password);
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'This invite link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Set Your Password</Text>
          <Text style={styles.subtitle}>
            You've been invited to GatherSafe. Set a password to activate your account and get started.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Invite Code</Text>
            <TextInput
              style={styles.input}
              value={token}
              onChangeText={setToken}
              placeholder="Paste code from email"
              placeholderTextColor={COLORS.gray500}
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
              placeholder="At least 8 characters"
              placeholderTextColor={COLORS.gray500}
              secureTextEntry
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repeat password"
              placeholderTextColor={COLORS.gray500}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAccept}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Activating...' : 'Activate Account'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACING.xl },
  backButton: { position: 'absolute', top: 60, left: SPACING.xl },
  backText: { ...TYPOGRAPHY.bodySmall, color: COLORS.info },
  header: { marginBottom: SPACING.xxl },
  title: { ...TYPOGRAPHY.heading1, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  subtitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, lineHeight: 22 },
  form: { gap: SPACING.md },
  inputContainer: { gap: SPACING.xs },
  label: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, fontWeight: '600' },
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
  buttonDisabled: { opacity: 0.6 },
  buttonText: { ...TYPOGRAPHY.button, color: COLORS.white },
});
