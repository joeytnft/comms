import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useLocationStore } from '@/store/useLocationStore';
import { TeamMemberLocation } from '@/types';
import { TeamMapView } from '@/components/map/TeamMapView';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

export function TeamMapScreen() {
  const { teamLocations, isSharing, isLoading, error, fetchTeamLocations, setSharing } =
    useLocationStore();
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchTeamLocations();

      refreshInterval.current = setInterval(() => {
        fetchTeamLocations();
      }, 30_000);

      return () => {
        if (refreshInterval.current) clearInterval(refreshInterval.current);
      };
    }, []),
  );

  const timeSince = (dateStr: string | null): string => {
    if (!dateStr) return 'Unknown';
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const renderMember = ({ item }: { item: TeamMemberLocation }) => (
    <View style={styles.memberCard}>
      <View style={styles.memberAvatar}>
        <Text style={styles.avatarText}>{item.displayName.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{item.displayName}</Text>
        <Text style={styles.memberCoords}>
          {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
        </Text>
      </View>
      <View style={styles.memberMeta}>
        <Text style={styles.lastSeen}>{timeSince(item.updatedAt)}</Text>
        <View
          style={[
            styles.onlineDot,
            {
              backgroundColor:
                Date.now() - new Date(item.updatedAt).getTime() < 300_000
                  ? COLORS.success
                  : COLORS.gray500,
            },
          ]}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Team Map</Text>
        <TouchableOpacity
          style={[styles.sharingToggle, isSharing && styles.sharingActive]}
          onPress={() => setSharing(!isSharing)}
        >
          <Text style={[styles.sharingText, isSharing && styles.sharingTextActive]}>
            {isSharing ? 'Sharing ON' : 'Sharing OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      <TeamMapView locations={teamLocations} style={styles.map} />

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>
        Team Locations ({teamLocations.length})
      </Text>
      <FlatList
        data={teamLocations}
        renderItem={renderMember}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={fetchTeamLocations}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No team locations</Text>
            <Text style={styles.emptySubtext}>Team members need to enable location sharing</Text>
          </View>
        }
      />
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
  title: { ...TYPOGRAPHY.heading1, color: COLORS.textPrimary },
  sharingToggle: {
    borderWidth: 1,
    borderColor: COLORS.gray600,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  sharingActive: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  sharingText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, fontWeight: '600' },
  sharingTextActive: { color: COLORS.white },
  map: {
    marginHorizontal: SPACING.lg,
    height: 220,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { ...TYPOGRAPHY.body, color: COLORS.white, fontWeight: '700' },
  memberInfo: { flex: 1, marginLeft: SPACING.md },
  memberName: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  memberCoords: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 2 },
  memberMeta: { alignItems: 'flex-end' },
  lastSeen: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginBottom: 4 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  errorContainer: { alignItems: 'center', paddingVertical: SPACING.sm },
  errorText: { ...TYPOGRAPHY.bodySmall, color: COLORS.danger },
  emptyContainer: { alignItems: 'center', paddingTop: SPACING.xxl },
  emptyText: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary },
  emptySubtext: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});
