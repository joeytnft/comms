import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { useCampusStore } from '@/store/useCampusStore';
import { useCampusViewStore } from '@/store/useCampusViewStore';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

/**
 * Shown only to org-level users (role=owner, no campus assignment) on
 * Enterprise plans. Lets them switch the active campus view context.
 */
export function CampusSwitcher() {
  const { user } = useAuth();
  const { subscription } = useSubscriptionStore();
  const { campuses } = useCampusStore();
  const { activeCampusId, activeCampusName, setActiveCampus } = useCampusViewStore();
  const [open, setOpen] = useState(false);

  // Visible to org-level users (owner or admin) with no campus assignment on Enterprise
  const isEnterprise = subscription?.tier === 'ENTERPRISE';
  const isOrgLevel = (user?.role === 'owner' || user?.role === 'admin') && !user?.campusId;
  if (!isEnterprise || !isOrgLevel || campuses.length === 0) return null;

  const label = activeCampusName ?? 'All Campuses';

  return (
    <>
      <TouchableOpacity style={styles.pill} onPress={() => setOpen(true)}>
        <Text style={styles.pillText}>{label}</Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>View Campus</Text>

            <FlatList
              data={[{ id: null, name: 'All Campuses' }, ...campuses.map((c) => ({ id: c.id, name: c.name }))]}
              keyExtractor={(item) => item.id ?? '__all'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, activeCampusId === item.id && styles.optionSelected]}
                  onPress={() => {
                    setActiveCampus(item.id, item.id ? item.name : null);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, activeCampusId === item.id && styles.optionTextSelected]}>
                    {item.name}
                  </Text>
                  {activeCampusId === item.id && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    gap: 4,
    ...SHADOWS.sm,
  },
  pillText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.info,
    fontWeight: '600',
  },
  chevron: {
    color: COLORS.info,
    fontSize: 12,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  sheetTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  optionSelected: {
    backgroundColor: COLORS.accent + '18',
  },
  optionText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
  },
  optionTextSelected: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  check: {
    color: COLORS.accent,
    fontWeight: '700',
  },
});
