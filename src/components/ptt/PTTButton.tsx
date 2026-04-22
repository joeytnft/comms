import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SHADOWS } from '@/config/theme';
import { PTTState } from '@/types';
import { pttBeeps } from '@/utils/pttBeeps';

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

  const handlePressIn = () => {
    if (disabled) return;

    Animated.spring(scaleAnim, {
      toValue: 0.93,
      useNativeDriver: false,
    }).start();

    pulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.18,
          duration: 500,
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: false,
        }),
      ]),
    );
    pulseRef.current.start();

    pttBeeps.onTransmitStart();
    onPressIn();
  };

  const handlePressOut = () => {
    if (disabled) return;

    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: false,
    }).start();

    pulseRef.current?.stop();
    pulseAnim.setValue(1);

    pttBeeps.onTransmitStop();
    onPressOut();
  };

  const buttonColor = disabled ? COLORS.gray600 : STATE_COLORS[state];
  const ringSize = size + 44;
  const iconSize = Math.round(size * 0.40);

  return (
    <View style={styles.container}>
      {/* Idle ready ring — subtle glow when connected and ready */}
      {!disabled && state === 'idle' && (
        <View
          style={[
            styles.idleRing,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderColor: COLORS.pttIdleGlow,
            },
          ]}
        />
      )}

      {/* Pulse ring when transmitting */}
      {state === 'transmitting' && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
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
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
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
          {/* Inner highlight ring for depth */}
          <View
            style={[
              styles.innerRing,
              {
                width: size - 20,
                height: size - 20,
                borderRadius: (size - 20) / 2,
              },
            ]}
          />
          <Ionicons
            name={state === 'receiving' ? 'volume-high' : 'mic'}
            size={iconSize}
            color={COLORS.white}
          />
        </Animated.View>
      </Pressable>

      <Text style={[styles.label, { color: disabled ? COLORS.gray500 : buttonColor }]}>
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
  innerRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  idleRing: {
    position: 'absolute',
    borderWidth: 2,
    opacity: 0.5,
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 3,
    opacity: 0.45,
  },
  receivingRing: {
    position: 'absolute',
    borderWidth: 3,
    opacity: 0.6,
  },
  label: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 20,
    textTransform: 'uppercase',
  },
});
