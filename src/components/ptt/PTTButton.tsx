import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { COLORS, TYPOGRAPHY, SHADOWS } from '@/config/theme';
import { PTTState } from '@/types';

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
  size = 160,
}: PTTButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  const handlePressIn = () => {
    if (disabled) return;

    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
    }).start();

    // Start pulse animation for transmitting
    pulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseRef.current.start();

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

    onPressOut();
  };

  const buttonColor = disabled ? COLORS.gray600 : STATE_COLORS[state];
  const outerSize = size + 32;

  return (
    <View style={styles.container}>
      {/* Pulse ring when transmitting */}
      {state === 'transmitting' && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              width: outerSize,
              height: outerSize,
              borderRadius: outerSize / 2,
              borderColor: COLORS.pttTransmitting,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />
      )}

      {/* Receiving indicator ring */}
      {state === 'receiving' && (
        <View
          style={[
            styles.receivingRing,
            {
              width: outerSize,
              height: outerSize,
              borderRadius: outerSize / 2,
              borderColor: COLORS.pttReceiving,
            },
          ]}
        />
      )}

      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || state === 'receiving'}
      >
        <Animated.View
          style={[
            styles.button,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: buttonColor,
              transform: [{ scale: scaleAnim }],
            },
            SHADOWS.lg,
          ]}
        >
          <Text style={styles.icon}>
            {state === 'transmitting' ? '||' : state === 'receiving' ? ')))' : 'MIC'}
          </Text>
        </Animated.View>
      </Pressable>

      <Text style={[styles.label, { color: buttonColor }]}>
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
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    ...TYPOGRAPHY.heading1,
    color: COLORS.white,
    fontWeight: '800',
    letterSpacing: 2,
  },
  label: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 16,
    textTransform: 'uppercase',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 3,
    opacity: 0.4,
  },
  receivingRing: {
    position: 'absolute',
    borderWidth: 3,
    opacity: 0.6,
  },
});
