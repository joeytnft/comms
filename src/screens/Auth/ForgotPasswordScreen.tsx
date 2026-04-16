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
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';

export function ForgotPasswordScreen({ navigation }: { navigation: any }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await apiClient.post(ENDPOINTS.AUTH.FORGOT_PASSWORD, { email: email.trim() });
      setSent(true);
    } catch {
      // Always show success to avoid revealing account existence
      setSent(true);
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
          <Text style={styles.backText}>← Back to Sign In</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Forgot Password</Text>
          <Text style={styles.subtitle}>
            {sent
              ? 'If that email is registered, a reset link has been sent. Check your inbox.'
              : "Enter your email and we'll send you a link to reset your password."}
          </Text>
        </View>

        {!sent && (
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
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send Reset Link'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {sent && (
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate('ResetPassword')}
          >
            <Text style={styles.buttonText}>Enter Reset Code</Text>
          </TouchableOpacity>
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
  backButton: {
    position: 'absolute',
    top: 60,
    left: SPACING.xl,
  },
  backText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.info,
  },
  header: {
    marginBottom: SPACING.xxl,
  },
  title: {
    ...TYPOGRAPHY.heading1,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    lineHeight: 22,
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
});
