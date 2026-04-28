import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useLocationStore } from '@/store/useLocationStore';
import { useAlertStore } from '@/store/useAlertStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useCampusViewStore } from '@/store/useCampusViewStore';
import { useCampusStore } from '@/store/useCampusStore';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { CampusSwitcher } from '@/components/common/CampusSwitcher';
import { TeamMemberLocation, Geofence } from '@/types';
import { TeamMapView } from '@/components/map/TeamMapView';
import { geofenceService } from '@/services/geofenceService';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

const MemberCard = memo(function MemberCard({ item }: { item: TeamMemberLocation }) {
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
  const { teamLocations, isSharing, error, fetchTeamLocations, setSharing, initSharing } =
    useLocationStore();
  const { activeAlerts, fetchAlerts } = useAlertStore();
  const { user } = useAuthStore();
  const { activeCampusId } = useCampusViewStore();
  const { fetchCampuses, fetchMyMemberships } = useCampusStore();
  const { subscription } = useSubscriptionStore();
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [geofence, setGeofence] = useState<Geofence | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const mapHeight = useRef(new Animated.Value(280)).current;
  const lastTapRef = useRef(0);

  // Restore persisted sharing state once on mount
  useEffect(() => {
    initSharing();
  }, []);

  // Fall back to the user's own campusId so campus-assigned users see their geofence
  // even when no explicit campus view is selected.
  const effectiveCampusId = activeCampusId ?? user?.campusId ?? null;

  // One-time setup on focus: campuses, alerts. Also refetch geofence here so
  // an admin's edit on the website is picked up the next time the user opens
  // the map screen (the campus-change effect below only runs on switch, so
  // without this the cached geofence stays stale for the whole session).
  useFocusEffect(
    useCallback(() => {
      if (subscription?.tier === 'PRO') {
        fetchCampuses();
        // For campus-scoped users: fetch their own memberships so the switcher
        // can offer their other campuses without requiring admin access.
        if (user?.campusId) fetchMyMemberships();
      }
      fetchAlerts({ active: true });

      let cancelled = false;
      if (effectiveCampusId) {
        geofenceService.fetchGeofence(effectiveCampusId).then((gf) => {
          if (cancelled) return;
          setGeofence(gf);
        });
      }

      return () => {
        cancelled = true;
        if (refreshInterval.current) clearInterval(refreshInterval.current);
      };
    }, [effectiveCampusId]),
  );

  useEffect(() => {
    let cancelled = false;

    fetchTeamLocations(activeCampusId);

    if (refreshInterval.current) clearInterval(refreshInterval.current);
    refreshInterval.current = setInterval(() => {
      fetchTeamLocations(activeCampusId);
    }, 5_000);

    // Always stop the previous geofence region before registering a new one.
    // Not doing this is what causes the crash when switching campuses quickly.
    geofenceService.stopGeofencing().catch(() => null);

    if (effectiveCampusId) {
      geofenceService.fetchGeofence(effectiveCampusId).then((gf) => {
        if (cancelled) return; // campus changed before this promise resolved — discard
        setGeofence(gf);
        if (gf) geofenceService.startGeofencing(gf).catch(() => null);
      });
    } else {
      setGeofence(null);
    }

    return () => {
      cancelled = true;
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, [effectiveCampusId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter current user out of map markers only — native showsUserLocation draws their blue dot.
  // The member list shows everyone including self.
  const mapLocations = teamLocations.filter((l) => l.userId !== user?.id);

  const handleMapTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap
      const expanded = !mapExpanded;
      setMapExpanded(expanded);
      Animated.spring(mapHeight, {
        toValue: expanded ? 520 : 280,
        useNativeDriver: false,
        bounciness: 4,
      }).start();
    }
    lastTapRef.current = now;
  }, [mapExpanded, mapHeight]);

  const renderMember = useCallback(
    ({ item }: { item: TeamMemberLocation }) => <MemberCard item={item} />,
    [],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Team Map</Text>
        <View style={styles.headerRight}>
          <CampusSwitcher />
          <TouchableOpacity
          style={[styles.sharingToggle, isSharing && styles.sharingActive]}
          onPress={() => setSharing(!isSharing)}
        >
          <Text style={[styles.sharingText, isSharing && styles.sharingTextActive]}>
            {isSharing ? 'Sharing ON' : 'Sharing OFF'}
          </Text>
        </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity activeOpacity={1} onPress={handleMapTap}>
        <Animated.View style={[styles.map, { height: mapHeight }]}>
          <TeamMapView locations={mapLocations} geofence={geofence} activeAlerts={activeAlerts} style={styles.mapInner} />
          <View style={styles.mapHint}>
            <Text style={styles.mapHintText}>{mapExpanded ? '▲ Double-tap to shrink' : '▼ Double-tap to expand'}</Text>
          </View>
        </Animated.View>
      </TouchableOpacity>

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
        Team Locations ({teamLocations.length})
      </Text>
      <FlatList
        data={teamLocations}
        renderItem={renderMember}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.list}
        bounces={false}
        refreshControl={
          <RefreshControl
            refreshing={isManualRefreshing}
            onRefresh={async () => {
              setIsManualRefreshing(true);
              await fetchTeamLocations();
              setIsManualRefreshing(false);
            }}
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
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
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  mapInner: {
    flex: 1,
  },
  mapHint: {
    position: 'absolute',
    bottom: 6,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mapHintText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.white,
    fontSize: 10,
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
