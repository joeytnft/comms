import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useLocationStore } from '@/store/useLocationStore';
import { useAlertStore } from '@/store/useAlertStore';
import { useAuthStore } from '@/store/useAuthStore';
import { TeamMemberLocation, Geofence } from '@/types';
import { TeamMapView } from '@/components/map/TeamMapView';
import { geofenceService } from '@/services/geofenceService';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

const MemberCard = memo(({ item }: { item: TeamMemberLocation }) => {
  const isOnline = Date.now() - new Date(item.updatedAt).getTime() < 300_000;
  const seconds = Math.floor((Date.now() - new Date(item.updatedAt).getTime()) / 1000);
  let timeSince = 'Unknown';
  if (!isNaN(seconds)) {
    if (seconds < 60) timeSince = 'Just now';
    else if (seconds < 3600) timeSince = `${Math.floor(seconds / 60)}m ago`;
    else if (seconds < 86400) timeSince = `${Math.floor(seconds / 3600)}h ago`;
    else timeSince = `${Math.floor(seconds / 86400)}d ago`;
  }
  return (
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
        <Text style={styles.lastSeen}>{timeSince}</Text>
        <View style={[styles.onlineDot, { backgroundColor: isOnline ? COLORS.success : COLORS.gray500 }]} />
      </View>
    </View>
  );
});

export function TeamMapScreen() {
  const { teamLocations, isSharing, isLoading, error, fetchTeamLocations, setSharing, initSharing } =
    useLocationStore();
  const { activeAlerts, fetchAlerts } = useAlertStore();
  const { user } = useAuthStore();
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [geofence, setGeofence] = useState<Geofence | null>(null);

  // Restore persisted sharing state once on mount
  useEffect(() => {
    initSharing();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTeamLocations();
      fetchAlerts({ active: true });

      // Load geofence and start background monitoring
      geofenceService.fetchGeofence().then((gf) => {
        setGeofence(gf);
        if (gf) geofenceService.startGeofencing(gf).catch(() => null);
      });

      refreshInterval.current = setInterval(() => {
        fetchTeamLocations();
      }, 5_000);

      return () => {
        if (refreshInterval.current) clearInterval(refreshInterval.current);
      };
    }, []),
  );

  // Filter out the current user from map markers — showsUserLocation handles their dot natively
  const otherLocations = teamLocations.filter((l) => l.userId !== user?.id);

  const renderMember = useCallback(
    ({ item }: { item: TeamMemberLocation }) => <MemberCard item={item} />,
    [],
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

      <TeamMapView locations={otherLocations} geofence={geofence} activeAlerts={activeAlerts} style={styles.map} />

      {geofence && (
        <View style={styles.geofenceBar}>
          <Text style={styles.geofenceText}>
            Geofence: {geofence.name} · {geofence.radius >= 1000
              ? `${(geofence.radius / 1000).toFixed(1)}km`
              : `${Math.round(geofence.radius)}m`}
          </Text>
        </View>
      )}

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>
        Team Locations ({otherLocations.length})
      </Text>
      <FlatList
        data={otherLocations}
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
  geofenceBar: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.info + '22',
    borderRadius: BORDER_RADIUS.sm,
  },
  geofenceText: { ...TYPOGRAPHY.caption, color: COLORS.info },
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
