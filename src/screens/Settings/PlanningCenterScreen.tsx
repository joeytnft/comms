import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { usePcoStore } from '@/store/usePcoStore';
import { useGroupStore } from '@/store/useGroupStore';
import { PcoTeam } from '@/services/pcoClientService';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

WebBrowser.maybeCompleteAuthSession();

type SyncTab = 'people' | 'teams' | 'services';

export function PlanningCenterScreen() {
  const navigation = useNavigation();
  const {
    status, people, teams, plans, planSchedule, lastSyncResult,
    isLoading, isSyncing, error,
    fetchStatus, fetchPeople, fetchTeams, fetchPlans, fetchPlanSchedule,
    disconnect, syncPeople, syncTeams, syncServices, linkTeam,
  } = usePcoStore();
  const { groups, fetchGroups } = useGroupStore();

  const [activeTab, setActiveTab] = useState<SyncTab>('people');
  const [linkModalTeam, setLinkModalTeam] = useState<PcoTeam | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('integrations/pco/success')) {
        fetchStatus();
        const orgParam = url.match(/org=([^&]+)/)?.[1];
        Alert.alert('Connected!', `Successfully connected to ${orgParam ? decodeURIComponent(orgParam) : 'Planning Center'}.`);
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
      fetchGroups();
    }, []),
  );

  // Load tab data when switching
  useEffect(() => {
    if (!status?.connected) return;
    if (activeTab === 'people') fetchPeople();
    if (activeTab === 'teams') fetchTeams();
    if (activeTab === 'services') fetchPlans();
  }, [activeTab, status?.connected]);

  const handleConnect = async () => {
    try {
      const { authorizeUrl } = await import('@/services/pcoClientService').then(
        (m) => m.pcoClientService.initiateConnect(),
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
          text: 'Disconnect', style: 'destructive',
          onPress: async () => {
            try { await disconnect(); } catch { Alert.alert('Error', 'Failed to disconnect'); }
          },
        },
      ],
    );
  };

  const handleSync = async () => {
    try {
      if (activeTab === 'people') await syncPeople();
      else if (activeTab === 'teams') await syncTeams();
      else await syncServices();
    } catch {
      Alert.alert('Sync Failed', 'Could not sync data from Planning Center');
    }
  };

  const handleLinkTeam = async (groupId: string | null) => {
    if (!linkModalTeam) return;
    try {
      await linkTeam(linkModalTeam.pcoId, groupId);
      setLinkModalTeam(null);
    } catch {
      Alert.alert('Error', 'Could not link team to group');
    }
  };

  const togglePlanSchedule = (pcoId: string) => {
    if (expandedPlanId === pcoId) {
      setExpandedPlanId(null);
    } else {
      setExpandedPlanId(pcoId);
      fetchPlanSchedule(pcoId);
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

  const statusLabel = (s: string) => {
    if (s === 'C') return 'Confirmed';
    if (s === 'D') return 'Declined';
    return 'Unconfirmed';
  };

  const statusColor = (s: string) => {
    if (s === 'C') return COLORS.success;
    if (s === 'D') return COLORS.danger;
    return COLORS.warning;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Planning Center</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandCard}>
          <View style={styles.brandLogo}>
            <Text style={styles.brandLogoText}>PCO</Text>
          </View>
          <View style={styles.brandInfo}>
            <Text style={styles.brandName}>Planning Center Online</Text>
            <Text style={styles.brandSub}>Sync people, teams, and service schedules</Text>
          </View>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

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
              <Text style={styles.connectedMeta}>Connected {formatDate(status.connectedAt)}</Text>
              <Text style={styles.connectedMeta}>Last sync: {formatDate(status.lastSyncAt)}</Text>
              <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
                <Text style={styles.disconnectText}>Disconnect</Text>
              </TouchableOpacity>
            </View>

            {/* Last sync result banner */}
            {lastSyncResult && activeTab === 'people' && (
              <View style={styles.syncResultBanner}>
                <Text style={styles.syncResultText}>
                  Last import: {lastSyncResult.invited} invited · {lastSyncResult.linked} linked · {lastSyncResult.skipped} skipped (no email)
                </Text>
              </View>
            )}

            {/* Tabs */}
            <View style={styles.tabs}>
              {(['people', 'teams', 'services'] as SyncTab[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tab, activeTab === tab && styles.tabActive]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
              onPress={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.syncBtnText}>
                  {activeTab === 'people' ? 'Import People from PCO'
                    : activeTab === 'teams' ? 'Sync Teams from PCO'
                    : 'Sync Services from PCO'}
                </Text>
              )}
            </TouchableOpacity>

            {/* ── People Tab ── */}
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
                    <View style={styles.accountBadge}>
                      {p.gatherSafeUser ? (
                        <View style={[styles.badge, p.gatherSafeUser.accountStatus === 'ACTIVE' ? styles.badgeActive : styles.badgeInvited]}>
                          <Text style={styles.badgeText}>
                            {p.gatherSafeUser.accountStatus === 'ACTIVE' ? 'Active' : 'Invited'}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.badge, styles.badgeNone]}>
                          <Text style={styles.badgeText}>No Account</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
            {activeTab === 'people' && !isSyncing && people.length === 0 && (
              <Text style={styles.emptyHint}>{'Tap "Import People" to pull your PCO roster and create app accounts'}</Text>
            )}

            {/* ── Teams Tab ── */}
            {activeTab === 'teams' && teams.length > 0 && (
              <View style={styles.resultsCard}>
                <Text style={styles.resultsTitle}>{teams.length} Teams</Text>
                <Text style={styles.sectionHint}>
                  Link a PCO team to a GatherSafe group to automatically assign members.
                </Text>
                {teams.map((team) => (
                  <View key={team.id} style={styles.teamRow}>
                    <View style={styles.teamLeft}>
                      <Text style={styles.teamServiceType}>{team.serviceTypeName}</Text>
                      <Text style={styles.teamName}>{team.name}</Text>
                      <Text style={styles.teamMeta}>{team.memberCount} members</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.linkBtn, team.groupId ? styles.linkBtnLinked : styles.linkBtnEmpty]}
                      onPress={() => setLinkModalTeam(team)}
                    >
                      <Text style={[styles.linkBtnText, team.groupId && styles.linkBtnTextLinked]}>
                        {team.linkedGroupName ?? 'Link Group'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            {activeTab === 'teams' && !isSyncing && teams.length === 0 && (
              <Text style={styles.emptyHint}>{'Tap "Sync Teams" to pull your PCO service teams'}</Text>
            )}

            {/* ── Services Tab ── */}
            {activeTab === 'services' && plans.length > 0 && (
              <View style={styles.resultsCard}>
                <Text style={styles.resultsTitle}>Upcoming Services</Text>
                {plans.map((plan) => {
                  const isExpanded = expandedPlanId === plan.pcoId;
                  const schedule = planSchedule[plan.pcoId] ?? [];
                  return (
                    <View key={plan.id} style={styles.planBlock}>
                      <TouchableOpacity style={styles.planRow} onPress={() => togglePlanSchedule(plan.pcoId)}>
                        <View style={styles.planLeft}>
                          <Text style={styles.planType}>{plan.serviceTypeName}</Text>
                          <Text style={styles.planTitle}>{plan.title ?? plan.seriesTitle ?? 'Untitled'}</Text>
                          {plan.sortDate && (
                            <Text style={styles.planDate}>
                              {new Date(plan.sortDate).toLocaleDateString(undefined, {
                                weekday: 'short', month: 'short', day: 'numeric',
                              })}
                            </Text>
                          )}
                        </View>
                        <View style={styles.planRight}>
                          {plan.totalLength > 0 && (
                            <Text style={styles.planDuration}>{formatDuration(plan.totalLength)}</Text>
                          )}
                          <Text style={styles.planChevron}>{isExpanded ? '▲' : '▼'}</Text>
                        </View>
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.scheduleList}>
                          {schedule.length === 0 ? (
                            <ActivityIndicator color={COLORS.accent} style={{ marginVertical: SPACING.sm }} />
                          ) : (
                            schedule.map((sp) => (
                              <View key={sp.id} style={styles.scheduledRow}>
                                <View style={styles.scheduledAvatar}>
                                  <Text style={styles.scheduledAvatarText}>
                                    {(sp.person?.name ?? '?').charAt(0).toUpperCase()}
                                  </Text>
                                </View>
                                <View style={styles.scheduledInfo}>
                                  <Text style={styles.scheduledName}>{sp.person?.name ?? 'Unknown'}</Text>
                                  {sp.teamName && <Text style={styles.scheduledTeam}>{sp.teamName}</Text>}
                                  {sp.position && <Text style={styles.scheduledPos}>{sp.position}</Text>}
                                </View>
                                <View style={[styles.statusChip, { backgroundColor: statusColor(sp.status) + '22' }]}>
                                  <Text style={[styles.statusChipText, { color: statusColor(sp.status) }]}>
                                    {statusLabel(sp.status)}
                                  </Text>
                                </View>
                              </View>
                            ))
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
            {activeTab === 'services' && !isSyncing && plans.length === 0 && (
              <Text style={styles.emptyHint}>{'Tap "Sync Services" to pull upcoming service plans'}</Text>
            )}
          </>
        ) : (
          <View style={styles.connectCard}>
            <Text style={styles.connectTitle}>Connect to Planning Center</Text>
            <Text style={styles.connectBody}>
              {"Sync your congregation roster and service schedules. Imported people automatically get app access — they'll receive an email to set their password."}
            </Text>
            <View style={styles.featureList}>
              {[
                'Import PCO people and auto-create accounts',
                'Sync service teams and link to security groups',
                'View who is scheduled on each service',
              ].map((f) => (
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

      {/* ── Link Team Modal ── */}
      <Modal
        visible={!!linkModalTeam}
        transparent
        animationType="slide"
        onRequestClose={() => setLinkModalTeam(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {`Link "${linkModalTeam?.name}" to a Group`}
            </Text>
            <Text style={styles.modalSub}>
              Members of this PCO team will be automatically added to the selected GatherSafe group on each sync.
            </Text>

            <FlatList
              data={[{ id: '', name: 'No link (unlink)' }, ...groups]}
              keyExtractor={(g) => g.id}
              style={styles.groupList}
              renderItem={({ item }) => {
                const isLinked = linkModalTeam?.groupId === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.groupOption, isLinked && styles.groupOptionSelected]}
                    onPress={() => handleLinkTeam(item.id || null)}
                  >
                    <Text style={[styles.groupOptionText, isLinked && styles.groupOptionTextSelected]}>
                      {item.name}
                    </Text>
                    {isLinked && <Text style={styles.checkMark}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity style={styles.modalCancel} onPress={() => setLinkModalTeam(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    width: 52, height: 52,
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
  syncResultBanner: {
    backgroundColor: COLORS.success + '18',
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  syncResultText: { ...TYPOGRAPHY.caption, color: COLORS.success },
  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: 4,
    marginBottom: SPACING.md,
  },
  tab: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: BORDER_RADIUS.sm },
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
  resultsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  resultsTitle: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  sectionHint: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginBottom: SPACING.md },
  // People
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  personAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center',
    marginRight: SPACING.md,
  },
  personAvatarText: { ...TYPOGRAPHY.body, color: COLORS.white, fontWeight: '700' },
  personInfo: { flex: 1 },
  personName: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  personDetail: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 1 },
  accountBadge: { marginLeft: SPACING.sm },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeActive: { backgroundColor: COLORS.success + '22' },
  badgeInvited: { backgroundColor: COLORS.warning + '22' },
  badgeNone: { backgroundColor: COLORS.gray700 },
  badgeText: { ...TYPOGRAPHY.caption, fontSize: 10, fontWeight: '700', color: COLORS.textSecondary },
  // Teams
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  teamLeft: { flex: 1 },
  teamServiceType: { ...TYPOGRAPHY.caption, color: COLORS.info, fontWeight: '600', marginBottom: 2 },
  teamName: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  teamMeta: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 2 },
  linkBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.gray600,
    maxWidth: 130,
  },
  linkBtnLinked: { borderColor: COLORS.success, backgroundColor: COLORS.success + '15' },
  linkBtnEmpty: { borderColor: COLORS.gray600 },
  linkBtnText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, fontWeight: '600', textAlign: 'center' },
  linkBtnTextLinked: { color: COLORS.success },
  // Plans / Services
  planBlock: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  planLeft: { flex: 1 },
  planType: { ...TYPOGRAPHY.caption, color: COLORS.info, fontWeight: '600', marginBottom: 2 },
  planTitle: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  planDate: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 2 },
  planRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  planDuration: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  planChevron: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  scheduleList: {
    paddingLeft: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.gray800 + '40',
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.xs,
  },
  scheduledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  scheduledAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.gray600,
    justifyContent: 'center', alignItems: 'center',
    marginRight: SPACING.sm,
  },
  scheduledAvatarText: { ...TYPOGRAPHY.caption, color: COLORS.white, fontWeight: '700' },
  scheduledInfo: { flex: 1 },
  scheduledName: { ...TYPOGRAPHY.bodySmall, color: COLORS.textPrimary, fontWeight: '600' },
  scheduledTeam: { ...TYPOGRAPHY.caption, color: COLORS.info, marginTop: 1 },
  scheduledPos: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 1 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusChipText: { ...TYPOGRAPHY.caption, fontSize: 10, fontWeight: '700' },
  emptyHint: {
    ...TYPOGRAPHY.body, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.lg,
  },
  // Connect screen
  connectCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  connectTitle: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  connectBody: {
    ...TYPOGRAPHY.body, color: COLORS.textSecondary, lineHeight: 22, marginBottom: SPACING.lg,
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
  // Link modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    maxHeight: '70%',
  },
  modalTitle: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary, marginBottom: SPACING.xs },
  modalSub: {
    ...TYPOGRAPHY.bodySmall, color: COLORS.textMuted, marginBottom: SPACING.lg, lineHeight: 20,
  },
  groupList: { maxHeight: 320, marginBottom: SPACING.md },
  groupOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
    borderRadius: BORDER_RADIUS.sm,
  },
  groupOptionSelected: { backgroundColor: COLORS.accent + '22' },
  groupOptionText: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, flex: 1 },
  groupOptionTextSelected: { color: COLORS.accent, fontWeight: '700' },
  checkMark: { color: COLORS.accent, fontWeight: '700', fontSize: 16 },
  modalCancel: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.gray700,
    marginTop: SPACING.sm,
  },
  modalCancelText: { ...TYPOGRAPHY.body, color: COLORS.danger, fontWeight: '600' },
});
