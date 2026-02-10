import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';

type RegistrationMode = 'create' | 'join';

export function RegisterScreen({ navigation }: { navigation: any }) {
  const { register, isLoading } = useAuth();
  const [mode, setMode] = useState<RegistrationMode>('create');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [organizationCode, setOrganizationCode] = useState('');
  const [organizationName, setOrganizationName] = useState('');

  const handleRegister = async () => {
    if (!displayName.trim() || !email.trim() || !password) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }

    if (mode === 'join' && !organizationCode.trim()) {
      Alert.alert('Error', 'Please enter an organization invite code.');
      return;
    }

    if (mode === 'create' && !organizationName.trim()) {
      Alert.alert('Error', 'Please enter your organization name.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters.');
      return;
    }

    try {
      await register({
        displayName: displayName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        organizationCode: mode === 'join' ? organizationCode.trim() : undefined,
        organizationName: mode === 'create' ? organizationName.trim() : undefined,
      });
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message || 'Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            {mode === 'create'
              ? 'Start your church security team'
              : 'Join your church security team'}
          </Text>
        </View>

        {/* Mode Toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'create' && styles.modeButtonActive]}
            onPress={() => setMode('create')}
          >
            <Text style={[styles.modeText, mode === 'create' && styles.modeTextActive]}>
              Create Organization
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'join' && styles.modeButtonActive]}
            onPress={() => setMode('join')}
          >
            <Text style={[styles.modeText, mode === 'join' && styles.modeTextActive]}>
              Join with Code
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {/* Organization Code (Join Mode) */}
          {mode === 'join' && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Organization Invite Code *</Text>
              <TextInput
                style={styles.input}
                value={organizationCode}
                onChangeText={setOrganizationCode}
                placeholder="Enter invite code from your team lead"
                placeholderTextColor={COLORS.gray500}
                autoCapitalize="characters"
              />
            </View>
          )}

          {/* Organization Name (Create Mode) */}
          {mode === 'create' && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Organization Name *</Text>
              <TextInput
                style={styles.input}
                value={organizationName}
                onChangeText={setOrganizationName}
                placeholder="Your church name"
                placeholderTextColor={COLORS.gray500}
              />
              <Text style={styles.helperText}>
                You'll be the admin and can invite team members later.
              </Text>
            </View>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Display Name *</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={COLORS.gray500}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email *</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={COLORS.gray500}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Phone (optional)</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 123-4567"
              placeholderTextColor={COLORS.gray500}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password *</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Min 8 characters"
              placeholderTextColor={COLORS.gray500}
              secureTextEntry
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Confirm Password *</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter password"
              placeholderTextColor={COLORS.gray500}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={() => navigation.goBack()}>
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkTextBold}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxl,
  },
  header: {
    marginBottom: SPACING.lg,
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
  modeToggle: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: COLORS.accent,
  },
  modeText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  modeTextActive: {
    color: COLORS.white,
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
  helperText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: -4,
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
