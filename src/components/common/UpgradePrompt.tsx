import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Button } from './Button';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';

interface UpgradePromptProps {
  visible: boolean;
  feature: string;
  requiredTier: string;
  onUpgrade: () => void;
  onDismiss: () => void;
}

export function UpgradePrompt({
  visible,
  feature,
  requiredTier,
  onUpgrade,
  onDismiss,
}: UpgradePromptProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <View style={styles.card}>
          <Text style={styles.title}>Upgrade Required</Text>
          <Text style={styles.message}>
            {feature} requires the {requiredTier} plan or higher.
            Upgrade to unlock this feature for your team.
          </Text>
          <View style={styles.buttons}>
            <Button
              title="Maybe Later"
              variant="secondary"
              onPress={onDismiss}
              style={styles.button}
            />
            <Button
              title={`Upgrade to ${requiredTier}`}
              variant="primary"
              onPress={onUpgrade}
              style={styles.button}
            />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  message: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  buttons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  button: {
    flex: 1,
  },
});
