import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SHADOWS } from '@/config/theme';
import { PTTState } from '@/types';
import { pttBeeps } from '@/utils/pttBeeps';
import { usePTTStore } from '@/store/usePTTStore';
import { nativePTTService } from '@/services/nativePTTService';

// Apple's PTT framework plays its own begin/end transmission tones whenever
// the system audio session activates. Apple's docs explicitly say:
//   "The framework doesn't support custom sound effects."
//   "Don't provide sound effects for these events."
// So we only play our own beeps on platforms where the framework is NOT in
// the loop (Android via CallKit, iOS without the entitlement, web).
const SUPPRESS_APP_BEEPS = nativePTTService.isAvailable;

interface PTTButtonProps {
  state: PTTState;
  onPressIn: () => void;
  onPressOut: () => void;
  disabled?: boolean;
  size?: number;
}

const STATE_COLORS: Record<PTTState, string> = {
  idle: COLORS.pttIdle,
  transmitting: COLORS.pttTransmitting,
  receiving: COLORS.pttReceiving,
};

const STATE_LABELS: Record<PTTState, string> = {
  idle: 'PUSH TO TALK',
  transmitting: 'TRANSMITTING',
  receiving: 'RECEIVING',
};

export function PTTButton({
  state,
  onPressIn,
  onPressOut,
  disabled = false,
  size = 240,
}: PTTButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);
  const { config } = usePTTStore();

  const handlePressIn = () => {
    if (disabled) return;

    Animated.spring(scaleAnim, {
      toValue: 0.93,
      useNativeDriver: true,
    }).start();

    pulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 500, useNativeDriver: true }),
      ]),
    );
    pulseRef.current.start();

    if (config.beepOnTransmit && !SUPPRESS_APP_BEEPS) pttBeeps.onTransmitStart();
    onPressIn();
  };

  const handlePressOut = () => {
    if (disabled) return;

    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();

    pulseRef.current?.stop();
    pulseAnim.setValue(1);

    if (config.beepOnTransmit && !SUPPRESS_APP_BEEPS) pttBeeps.onTransmitStop();
    onPressOut();
  };

  const buttonColor = disabled ? COLORS.gray600 : STATE_COLORS[state];
  const ringSize = size + 44;
  const iconSize = Math.round(size * 0.44);

  return (
    // Container sized to ring so absolute rings stay centered
    <View style={[styles.container, { width: ringSize, height: ringSize }]}>

      {/* Transmitting pulse ring */}
      {state === 'transmitting' && (
        <Animated.View style={[
          styles.ring,
          { width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderColor: COLORS.pttTransmitting, opacity: 0.45, transform: [{ scale: pulseAnim }] },
        ]} />
      )}

      {/* Receiving ring */}
      {state === 'receiving' && (
        <View style={[
          styles.ring,
          { width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderColor: COLORS.pttReceiving, opacity: 0.6, borderWidth: 3 },
        ]} />
      )}

      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || state === 'receiving'}
        style={styles.pressable}
      >
        {/* Animated.View only handles scale — backgroundColor is on the inner View
            so state-driven color changes always re-render correctly */}
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <View style={[
            styles.button,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: buttonColor },
            SHADOWS.lg,
          ]}>
            <View style={[
              styles.innerRing,
              { width: size - 20, height: size - 20, borderRadius: (size - 20) / 2 },
            ]} />
            <Ionicons
              name={state === 'receiving' ? 'volume-high' : 'mic'}
              size={iconSize}
              color={COLORS.white}
            />
          </View>
        </Animated.View>
      </Pressable>

      <Text style={[styles.label, { color: disabled ? COLORS.gray500 : buttonColor, top: ringSize / 2 + size / 2 + 12 }]}>
        {disabled ? 'NOT CONNECTED' : STATE_LABELS[state]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  label: {
    position: 'absolute',
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
    width: 200,
  },
});
