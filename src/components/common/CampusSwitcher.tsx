import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { useCampusStore } from '@/store/useCampusStore';
import { useCampusViewStore } from '@/store/useCampusViewStore';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

type CampusOption = { id: string | null; name: string };

/**
 * Visible on Team Map when the user has access to more than one campus:
 *
 * - Org-level users (owner/admin, no campusId): All Campuses + each org campus
 * - Campus-scoped users with 2+ memberships: their campuses only (no "All" option)
 *
 * Requires PRO subscription since multi-campus is a PRO feature.
 */
export function CampusSwitcher() {
  const { user } = useAuth();
  const { subscription } = useSubscriptionStore();
  const { campuses, myMemberships } = useCampusStore();
  const { activeCampusId, activeCampusName, setActiveCampus } = useCampusViewStore();
  const [open, setOpen] = useState(false);

  const isPro = subscription?.tier === 'PRO';
  const isOrgLevel = (user?.role === 'owner' || user?.role === 'admin') && !user?.campusId;
  const isCampusMember = !!user?.campusId;

  // Org-level: show if PRO and there are campuses to switch between
  // Campus-scoped: show if PRO and they belong to 2+ campuses
  const showForOrgLevel = isPro && isOrgLevel && campuses.length > 0;
  const showForMember = isPro && isCampusMember && myMemberships.length > 1;

  if (!showForOrgLevel && !showForMember) return null;

  let options: CampusOption[];
  let label: string;

  if (isOrgLevel) {
    options = [
      { id: null, name: 'All Campuses' },
      ...campuses.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })),
    ];
    label = activeCampusName ?? 'All Campuses';
  } else {
    options = myMemberships.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
    // Default label = whichever campus is active or their primary
    const effectiveId = activeCampusId ?? user?.campusId;
    label = myMemberships.find((c: { id: string }) => c.id === effectiveId)?.name ?? options[0]?.name ?? 'Campus';
  }

  // For campus-scoped members: the "selected" campus is the active override or their primary
  const memberEffectiveId = isCampusMember ? (activeCampusId ?? user?.campusId) : activeCampusId;

  return (
    <>
      <TouchableOpacity style={styles.pill} onPress={() => setOpen(true)}>
        <Text style={styles.pillText} numberOfLines={1}>{label}</Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>View Campus</Text>

              <FlatList
                data={options}
                keyExtractor={(item: CampusOption) => item.id ?? '__all'}
                renderItem={({ item }: { item: CampusOption }) => {
                  const isSelected = item.id === memberEffectiveId;
                  return (
                    <TouchableOpacity
                      style={[styles.option, isSelected && styles.optionSelected]}
                      onPress={() => {
                        setActiveCampus(item.id, item.id ? item.name : null);
                        setOpen(false);
                      }}
                    >
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                        {item.name}
                      </Text>
                      {isSelected && <Text style={styles.check}>✓</Text>}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </TouchableOpacity>
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
    maxWidth: 140,
    ...SHADOWS.sm,
  },
  pillText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.info,
    fontWeight: '600',
    flex: 1,
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
