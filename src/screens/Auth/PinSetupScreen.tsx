import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { pinLock } from '@/utils/pinLock';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export function PinSetupScreen() {
  const navigation = useNavigation<any>();
  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const current = step === 'create' ? pin : confirmPin;
  const setter = step === 'create' ? setPin : setConfirmPin;

  const handleDigit = (digit: string) => {
    if (digit === '⌫') {
      setter((p) => p.slice(0, -1));
      return;
    }
    if (digit === '') return;
    if (current.length >= 6) return;

    const next = current + digit;
    setter(next);

    if (next.length === 6) {
      setTimeout(() => handleComplete(next), 100);
    }
  };

  const handleComplete = async (value: string) => {
    if (step === 'create') {
      setStep('confirm');
    } else {
      if (value !== pin) {
        Alert.alert('PINs do not match', 'Please try again.');
        setConfirmPin('');
        setStep('create');
        setPin('');
        return;
      }
      try {
        await pinLock.setPin(value);
        Alert.alert('PIN Set', 'Your app lock PIN has been saved.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch {
        Alert.alert('Error', 'Failed to save PIN. Please try again.');
        setConfirmPin('');
        setStep('create');
        setPin('');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {step === 'create' ? 'Create PIN' : 'Confirm PIN'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.subtitle}>
          {step === 'create'
            ? 'Enter a 6-digit PIN to lock the app'
            : 'Re-enter your PIN to confirm'}
        </Text>

        {/* Dots */}
        <View style={styles.dots}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i < current.length && styles.dotFilled]}
            />
          ))}
        </View>

        {/* Keypad */}
        <View style={styles.keypad}>
          {DIGITS.map((digit, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.key, digit === '' && styles.keyEmpty]}
              onPress={() => handleDigit(digit)}
              disabled={digit === ''}
              activeOpacity={0.7}
            >
              <Text style={[styles.keyText, digit === '⌫' && styles.keyBackspace]}>
                {digit}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backBtn: { width: 60 },
  backText: { ...TYPOGRAPHY.body, color: COLORS.info },
  title: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: SPACING.xxl },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },
  dots: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xxl,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.textMuted,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 280,
    gap: SPACING.md,
    justifyContent: 'center',
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyEmpty: { backgroundColor: 'transparent' },
  keyText: { ...TYPOGRAPHY.heading2, color: COLORS.textPrimary },
  keyBackspace: { ...TYPOGRAPHY.heading3, color: COLORS.textMuted },
});
