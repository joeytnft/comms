import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';

interface VoiceIndicatorProps {
  displayName: string;
  isTransmitting: boolean;
}

export function VoiceIndicator({ displayName, isTransmitting }: VoiceIndicatorProps) {
  if (!isTransmitting) return null;

  return (
    <View style={styles.container}>
      <View style={styles.dot} />
      <Text style={styles.text} numberOfLines={1}>
        {displayName} is speaking
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.pttReceiving + '20',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.pttReceiving,
  },
  text: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.pttReceiving,
    fontWeight: '600',
  },
});
