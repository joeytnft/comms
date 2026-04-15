import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { useLocationStore } from '@/store/useLocationStore';
import { useAlertStore } from '@/store/useAlertStore';
import { useIncidentStore } from '@/store/useIncidentStore';
import { MainTabParamList } from '@/navigation/MainTabNavigator';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

type DashboardNav = BottomTabNavigationProp<MainTabParamList>;

export function DashboardScreen() {
  const { user } = useAuth();
  const { subscription, daysLeftInTrial, fetchSubscription } = useSubscriptionStore();
  const { teamLocations, fetchTeamLocations } = useLocationStore();
  const { activeAlerts, fetchAlerts } = useAlertStore();
  const { incidents, fetchIncidents } = useIncidentStore();
  const navigation = useNavigation<DashboardNav>();
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchSubscription();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTeamLocations();
      fetchAlerts({ active: true });
      fetchIncidents({ status: 'OPEN' });

      refreshInterval.current = setInterval(() => {
        fetchTeamLocations();
        fetchAlerts({ active: true });
        fetchIncidents({ status: 'OPEN' });
      }, 30_000);

      return () => {
        if (refreshInterval.current) clearInterval(refreshInterval.current);
      };
    }, []),
  );

  const onlineCount = teamLocations.filter(
    (l) => Date.now() - new Date(l.updatedAt).getTime() < 300_000,
  ).length;
  const activeAlertCount = activeAlerts.length;
  const openIncidentCount = incidents.filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length;

  const trialDays = daysLeftInTrial();
  const showTrialBanner = subscription?.status === 'TRIALING' && trialDays <= 3 && trialDays > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Trial expiring banner */}
        {showTrialBanner && (
          <View style={styles.trialBanner}>
            <Text style={styles.trialBannerText}>
              Your trial expires in {trialDays} day{trialDays !== 1 ? 's' : ''}. Upgrade to keep all features.
            </Text>
          </View>
        )}

        {/* Welcome header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.greeting}>
            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.nameText}>{user?.displayName || 'Team Member'}</Text>
          </View>
        </View>

        {/* Status card */}
        <View style={styles.statusCard}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>System Active</Text>
        </View>

        {/* Quick actions grid */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.grid}>
          <TouchableOpacity
            style={[styles.gridItem, { backgroundColor: COLORS.accent }]}
            onPress={() => navigation.navigate('Groups')}
          >
            <Text style={styles.gridIcon}>M</Text>
            <Text style={styles.gridLabel}>Messages</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.gridItem, { backgroundColor: COLORS.danger }]}
            onPress={() => navigation.navigate('PTT')}
          >
            <Text style={styles.gridIcon}>T</Text>
            <Text style={styles.gridLabel}>Push to Talk</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.gridItem, { backgroundColor: COLORS.warning }]}
            onPress={() => navigation.navigate('Alerts')}
          >
            <Text style={styles.gridIcon}>A</Text>
            <Text style={styles.gridLabel}>Alerts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.gridItem, { backgroundColor: COLORS.success }]}
            onPress={() => navigation.navigate('More', { screen: 'TeamMap' })}
          >
            <Text style={styles.gridIcon}>L</Text>
            <Text style={styles.gridLabel}>Team Map</Text>
          </TouchableOpacity>
        </View>

        {/* Info section */}
        <Text style={styles.sectionTitle}>Status</Text>
        <View style={styles.infoCard}>
          <TouchableOpacity style={styles.infoRow} onPress={() => navigation.navigate('More', { screen: 'TeamMap' } as any)}>
            <Text style={styles.infoLabel}>Team Members Online</Text>
            <Text style={[styles.infoValue, onlineCount > 0 && styles.valueOnline]}>{onlineCount}</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.infoRow} onPress={() => navigation.navigate('Alerts')}>
            <Text style={styles.infoLabel}>Active Alerts</Text>
            <Text style={[styles.infoValue, activeAlertCount > 0 && styles.valueDanger]}>{activeAlertCount}</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.infoRow} onPress={() => navigation.navigate('More', { screen: 'Incidents' } as any)}>
            <Text style={styles.infoLabel}>Open Incidents</Text>
            <Text style={[styles.infoValue, openIncidentCount > 0 && styles.valueWarning]}>{openIncidentCount}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.white,
  },
  greeting: {
    marginLeft: SPACING.md,
  },
  welcomeText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  nameText: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.success,
    marginRight: SPACING.sm,
  },
  statusText: {
    ...TYPOGRAPHY.body,
    color: COLORS.success,
    fontWeight: '600',
  },
  sectionTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  gridItem: {
    width: '47%',
    aspectRatio: 1.6,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
  },
  gridIcon: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  gridLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.white,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  infoLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  infoValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  valueOnline: { color: COLORS.success },
  valueDanger: { color: COLORS.danger },
  valueWarning: { color: COLORS.warning },
  divider: {
    height: 1,
    backgroundColor: COLORS.gray700,
  },
  trialBanner: {
    backgroundColor: COLORS.warning,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  trialBannerText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textInverse,
    fontWeight: '600',
    textAlign: 'center',
  },
});
