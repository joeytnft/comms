import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { usePcoStore } from '@/store/usePcoStore';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

WebBrowser.maybeCompleteAuthSession();

type SyncTab = 'people' | 'services';

export function PlanningCenterScreen() {
  const navigation = useNavigation();
  const { status, people, plans, isLoading, isSyncing, error, fetchStatus, disconnect, syncPeople, syncServices } = usePcoStore();
  const [activeTab, setActiveTab] = useState<SyncTab>('people');

  // Handle deep link callback from PCO OAuth
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('integrations/pco/success')) {
        fetchStatus();
        const orgParam = url.match(/org=([^&]+)/)?.[1];
        const orgName = orgParam ? decodeURIComponent(orgParam) : 'Planning Center';
        Alert.alert('Connected!', `Successfully connected to ${orgName}.`);
      } else if (url.includes('integrations/pco/error')) {
        const reason = url.match(/reason=([^&]+)/)?.[1] ?? 'unknown';
        Alert.alert('Connection Failed', `Could not connect to Planning Center: ${reason}`);
      }
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStatus();
    }, []),
  );

  const handleConnect = async () => {
    try {
      const { authorizeUrl } = await usePcoStore.getState().fetchStatus().then(
        () => import('@/services/pcoClientService').then((m) => m.pcoClientService.initiateConnect()),
      );
      await WebBrowser.openBrowserAsync(authorizeUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch {
      Alert.alert('Error', 'Could not start Planning Center authorization');
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Planning Center',
      'This will remove the connection and all synced data. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnect();
            } catch {
              Alert.alert('Error', 'Failed to disconnect');
            }
          },
        },
      ],
    );
  };

  const handleSync = async (type: SyncTab) => {
    try {
      if (type === 'people') {
        await syncPeople();
      } else {
        await syncServices();
      }
    } catch {
      Alert.alert('Sync Failed', 'Could not sync data from Planning Center');
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleString();
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    return m > 0 ? `${m} min` : `${seconds}s`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'<'} Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Planning Center</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Brand header */}
        <View style={styles.brandCard}>
          <View style={styles.brandLogo}>
            <Text style={styles.brandLogoText}>PCO</Text>
          </View>
          <View style={styles.brandInfo}>
            <Text style={styles.brandName}>Planning Center Online</Text>
            <Text style={styles.brandSub}>Sync people and service schedules</Text>
          </View>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Connection status */}
        {isLoading ? (
          <ActivityIndicator color={COLORS.accent} style={styles.loader} />
        ) : status?.connected ? (
          <>
            <View style={styles.connectedCard}>
              <View style={styles.connectedRow}>
                <View style={[styles.dot, styles.dotGreen]} />
                <Text style={styles.connectedLabel}>Connected</Text>
              </View>
              {status.pcoOrgName && (
                <Text style={styles.connectedOrg}>{status.pcoOrgName}</Text>
              )}
              <Text style={styles.connectedMeta}>
                Connected {formatDate(status.connectedAt)}
              </Text>
              <Text style={styles.connectedMeta}>
                Last sync: {formatDate(status.lastSyncAt)}
              </Text>
              <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
                <Text style={styles.disconnectText}>Disconnect</Text>
              </TouchableOpacity>
            </View>

            {/* Sync tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'people' && styles.tabActive]}
                onPress={() => setActiveTab('people')}
              >
                <Text style={[styles.tabText, activeTab === 'people' && styles.tabTextActive]}>
                  People
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'services' && styles.tabActive]}
                onPress={() => setActiveTab('services')}
              >
                <Text style={[styles.tabText, activeTab === 'services' && styles.tabTextActive]}>
                  Services
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
              onPress={() => handleSync(activeTab)}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.syncBtnText}>
                  Sync {activeTab === 'people' ? 'People' : 'Services'} from PCO
                </Text>
              )}
            </TouchableOpacity>

            {activeTab === 'people' && people.length > 0 && (
              <View style={styles.resultsCard}>
                <Text style={styles.resultsTitle}>{people.length} People</Text>
                {people.map((p) => (
                  <View key={p.id} style={styles.personRow}>
                    <View style={styles.personAvatar}>
                      <Text style={styles.personAvatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.personInfo}>
                      <Text style={styles.personName}>{p.name}</Text>
                      {p.email && <Text style={styles.personDetail}>{p.email}</Text>}
                      {p.phone && <Text style={styles.personDetail}>{p.phone}</Text>}
                    </View>
                    <View style={[styles.statusDot, p.status === 'active' ? styles.dotGreen : styles.dotGray]} />
                  </View>
                ))}
              </View>
            )}

            {activeTab === 'services' && plans.length > 0 && (
              <View style={styles.resultsCard}>
                <Text style={styles.resultsTitle}>Upcoming Services</Text>
                {plans.map((plan) => (
                  <View key={plan.id} style={styles.planRow}>
                    <View style={styles.planLeft}>
                      <Text style={styles.planType}>{plan.serviceTypeName}</Text>
                      <Text style={styles.planTitle}>
                        {plan.title ?? plan.seriesTitle ?? 'Untitled'}
                      </Text>
                      {plan.sortDate && (
                        <Text style={styles.planDate}>
                          {new Date(plan.sortDate).toLocaleDateString(undefined, {
                            weekday: 'short', month: 'short', day: 'numeric',
                          })}
                        </Text>
                      )}
                    </View>
                    {plan.totalLength > 0 && (
                      <Text style={styles.planDuration}>{formatDuration(plan.totalLength)}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {activeTab === 'people' && !isSyncing && people.length === 0 && (
              <Text style={styles.emptyHint}>Tap "Sync People" to pull your PCO roster</Text>
            )}
            {activeTab === 'services' && !isSyncing && plans.length === 0 && (
              <Text style={styles.emptyHint}>Tap "Sync Services" to pull upcoming service plans</Text>
            )}
          </>
        ) : (
          /* Not connected */
          <View style={styles.connectCard}>
            <Text style={styles.connectTitle}>Connect to Planning Center</Text>
            <Text style={styles.connectBody}>
              Sync your congregation roster and service schedules directly into GatherSafe. This is a paid add-on — contact support to enable it for your account.
            </Text>
            <View style={styles.featureList}>
              {['Import your PCO people roster', 'Sync upcoming service schedules', 'Keep teams aligned with service plans'].map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Text style={styles.featureCheck}>✓</Text>
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
              <Text style={styles.connectBtnText}>Connect Planning Center</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  backBtn: { width: 70 },
  backText: { ...TYPOGRAPHY.body, color: COLORS.info },
  title: { ...TYPOGRAPHY.heading2, color: COLORS.textPrimary },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  brandCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  brandLogo: {
    width: 52,
    height: 52,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: '#e8410e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  brandLogoText: { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  brandInfo: { flex: 1 },
  brandName: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '700' },
  brandSub: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 2 },
  errorBanner: {
    backgroundColor: COLORS.danger + '22',
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorText: { ...TYPOGRAPHY.bodySmall, color: COLORS.danger },
  loader: { marginTop: SPACING.xxl },
  // Connected state
  connectedCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  connectedRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xs },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: SPACING.sm },
  dotGreen: { backgroundColor: COLORS.success },
  dotGray: { backgroundColor: COLORS.gray500 },
  connectedLabel: { ...TYPOGRAPHY.body, color: COLORS.success, fontWeight: '700' },
  connectedOrg: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary, marginBottom: SPACING.xs },
  connectedMeta: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginBottom: 2 },
  disconnectBtn: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: BORDER_RADIUS.sm,
  },
  disconnectText: { ...TYPOGRAPHY.bodySmall, color: COLORS.danger, fontWeight: '600' },
  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: 4,
    marginBottom: SPACING.md,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
  },
  tabActive: { backgroundColor: COLORS.accent },
  tabText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textMuted, fontWeight: '600' },
  tabTextActive: { color: COLORS.white },
  syncBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { ...TYPOGRAPHY.body, color: COLORS.white, fontWeight: '700' },
  // Results
  resultsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  resultsTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  personAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  personAvatarText: { ...TYPOGRAPHY.body, color: COLORS.white, fontWeight: '700' },
  personInfo: { flex: 1 },
  personName: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  personDetail: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  planLeft: { flex: 1 },
  planType: { ...TYPOGRAPHY.caption, color: COLORS.info, fontWeight: '600', marginBottom: 2 },
  planTitle: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  planDate: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 2 },
  planDuration: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginLeft: SPACING.md },
  emptyHint: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  // Not connected state
  connectCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  connectTitle: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  connectBody: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  featureList: { marginBottom: SPACING.lg },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm },
  featureCheck: { color: COLORS.success, fontWeight: '700', marginRight: SPACING.sm, marginTop: 2 },
  featureText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, flex: 1 },
  connectBtn: {
    backgroundColor: '#e8410e',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  connectBtnText: { ...TYPOGRAPHY.body, color: COLORS.white, fontWeight: '700' },
});
