import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { pinLock } from '@/utils/pinLock';
import { COLORS, TYPOGRAPHY, SPACING } from '@/config/theme';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

interface Props {
  onUnlock: () => void;
}

export function PinEntryScreen({ onUnlock }: Props) {
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);

  const handleDigit = (digit: string) => {
    if (digit === '⌫') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (digit === '') return;
    if (pin.length >= 6) return;

    const next = pin + digit;
    setPin(next);

    if (next.length === 6) {
      setTimeout(() => verify(next), 100);
    }
  };

  const verify = async (entered: string) => {
    const correct = await pinLock.verifyPin(entered);
    if (correct) {
      onUnlock();
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setPin('');
      if (next >= 5) {
        Alert.alert(
          'Too many attempts',
          'Please use biometrics or contact support to regain access.',
        );
      } else {
        Alert.alert('Incorrect PIN', `${5 - next} attempt(s) remaining`);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Text style={styles.appName}>Guardian Comm</Text>
        <Text style={styles.subtitle}>Enter your PIN to unlock</Text>

        {/* Dots */}
        <View style={styles.dots}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
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

        {attempts > 0 && (
          <Text style={styles.attemptsText}>
            Incorrect PIN — {5 - attempts} attempt(s) remaining
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: SPACING.xxl },
  appName: { ...TYPOGRAPHY.heading1, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    marginBottom: SPACING.xl,
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
  attemptsText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.danger,
    marginTop: SPACING.lg,
  },
});
