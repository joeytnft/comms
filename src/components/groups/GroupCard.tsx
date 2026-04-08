import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Group } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

interface GroupCardProps {
  group: Group;
  onPress: (group: Group) => void;
}

export function GroupCard({ group, onPress }: GroupCardProps) {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(group)}
      activeOpacity={0.7}
    >
      <View style={[styles.colorBar, { backgroundColor: group.iconColor || COLORS.accent }]} />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={1}>{group.name}</Text>
          <View style={[styles.typeBadge, group.type === 'lead' ? styles.leadBadge : styles.subBadge]}>
            <Text style={styles.typeText}>{group.type === 'lead' ? 'LEAD CH' : 'SUB CH'}</Text>
          </View>
        </View>
        {group.description ? (
          <Text style={styles.description} numberOfLines={1}>{group.description}</Text>
        ) : null}
        <Text style={styles.memberCount}>
          {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  colorBar: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
    flex: 1,
    marginRight: SPACING.sm,
  },
  typeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  leadBadge: {
    backgroundColor: COLORS.accent,
  },
  subBadge: {
    backgroundColor: COLORS.gray700,
  },
  typeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 10,
  },
  description: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  memberCount: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
});
