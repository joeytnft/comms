import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert as RNAlert,
  Vibration,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAlertStore } from '@/store/useAlertStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertLevel, ALERT_COLORS, ALERT_LABELS } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';

const ALERT_LEVELS: AlertLevel[] = ['ATTENTION', 'WARNING', 'EMERGENCY'];

export function AlertsScreen() {
  const { user } = useAuth();
  const {
    alerts,
    activeAlerts,
    isLoading,
    error,
    fetchAlerts,
    triggerAlert,
    acknowledgeAlert,
    resolveAlert,
  } = useAlertStore();
  const { groups, fetchGroups } = useGroupStore();

  const [showHistory, setShowHistory] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [reasonModal, setReasonModal] = useState<{ visible: boolean; level: AlertLevel | null }>({
    visible: false,
    level: null,
  });
  const [reason, setReason] = useState('');
  // null = global; string[] = specific group IDs
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchAlerts({ active: true });
      if (groups.length === 0) fetchGroups();
    }, []),
  );

  // Groups the current user is in that have alerts enabled
  const myAlertGroups = groups.filter((g) => g.alertsEnabled);

  const openModal = (level: AlertLevel) => {
    setReason('');
    // Default scope: first sub-group the user is in, or null (global) if only lead
    const firstSub = myAlertGroups.find((g) => g.type === 'sub');
    setSelectedGroupIds(firstSub ? [firstSub.id] : null);
    setReasonModal({ visible: true, level });
  };

  const toggleGroupSelection = (groupId: string) => {
    if (selectedGroupIds === null) {
      // Was global — switch to just this group
      setSelectedGroupIds([groupId]);
    } else if (selectedGroupIds.includes(groupId)) {
      const next = selectedGroupIds.filter((id) => id !== groupId);
      setSelectedGroupIds(next.length === 0 ? null : next);
    } else {
      setSelectedGroupIds([...selectedGroupIds, groupId]);
    }
  };

  const setGlobal = () => setSelectedGroupIds(null);

  const handleSendAlert = async () => {
    if (!reasonModal.level) return;
    setReasonModal({ visible: false, level: null });
    setTriggering(true);
    try {
      await triggerAlert({
        level: reasonModal.level,
        message: reason.trim() || undefined,
        groupIds: selectedGroupIds ?? undefined,
      });
      Vibration.vibrate(200);
    } catch {
      RNAlert.alert('Error', 'Failed to trigger alert');
    } finally {
      setTriggering(false);
    }
  };

  const handlePanicPress = () => {
    Vibration.vibrate(100);
    openModal('EMERGENCY');
  };

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeAlert(id);
    } catch {
      RNAlert.alert('Error', 'Failed to acknowledge alert');
    }
  };

  const handleResolve = (id: string) => {
    RNAlert.alert('Resolve Alert', 'Mark this alert as resolved?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resolve',
        onPress: async () => {
          try {
            await resolveAlert(id);
          } catch {
            RNAlert.alert('Error', 'Failed to resolve alert');
          }
        },
      },
    ]);
  };

  const handleShowHistory = () => {
    if (!showHistory) fetchAlerts();
    setShowHistory(!showHistory);
  };

  const displayAlerts = showHistory ? alerts : activeAlerts;
  const userId = user?.id;

  const renderAlert = ({ item }: { item: Alert }) => {
    const isAcked = item.acknowledgments.some((a) => a.userId === userId);
    const isResolved = !!item.resolvedAt;
    const color = ALERT_COLORS[item.level];
    const isGlobal = item.targetGroups.length === 0;

    return (
      <View style={[styles.alertCard, { borderLeftColor: color }]}>
        <View style={styles.alertHeader}>
          <View style={[styles.levelBadge, { backgroundColor: color }]}>
            <Text style={styles.levelBadgeText}>{ALERT_LABELS[item.level]}</Text>
          </View>
          {isResolved && (
            <View style={styles.resolvedBadge}>
              <Text style={styles.resolvedBadgeText}>RESOLVED</Text>
            </View>
          )}
          <View style={styles.scopeBadge}>
            <Text style={styles.scopeBadgeText}>
              {isGlobal
                ? 'All Groups'
                : item.targetGroups.map((t) => t.group.name).join(', ')}
            </Text>
          </View>
        </View>

        {item.message ? <Text style={styles.alertMessage}>{item.message}</Text> : null}

        <Text style={styles.alertMeta}>
          {item.triggeredBy.displayName} · {new Date(item.createdAt).toLocaleTimeString()}
        </Text>

        <Text style={styles.ackCount}>
          {item.acknowledgments.length} acknowledged
        </Text>

        {!isResolved && (
          <View style={styles.alertActions}>
            {!isAcked && (
              <TouchableOpacity style={styles.ackButton} onPress={() => handleAcknowledge(item.id)}>
                <Text style={styles.ackButtonText}>Acknowledge</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.resolveButton} onPress={() => handleResolve(item.id)}>
              <Text style={styles.resolveButtonText}>Resolve</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const modalColor = reasonModal.level ? ALERT_COLORS[reasonModal.level] : COLORS.danger;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
        <TouchableOpacity onPress={handleShowHistory}>
          <Text style={styles.historyToggle}>{showHistory ? 'Active Only' : 'History'}</Text>
        </TouchableOpacity>
      </View>

      {/* Panic Button */}
      <View style={styles.panicSection}>
        <TouchableOpacity
          style={styles.panicButton}
          onPress={handlePanicPress}
          disabled={triggering}
          activeOpacity={0.7}
        >
          <Text style={styles.panicIcon}>!</Text>
          <Text style={styles.panicText}>PANIC</Text>
        </TouchableOpacity>
        <Text style={styles.panicHint}>Press for emergency alert</Text>
      </View>

      {/* Alert level triggers */}
      <View style={styles.levelRow}>
        {ALERT_LEVELS.map((level) => (
          <TouchableOpacity
            key={level}
            style={[styles.levelButton, { backgroundColor: ALERT_COLORS[level] }]}
            onPress={() => openModal(level)}
            disabled={triggering}
          >
            <Text style={styles.levelButtonText}>{ALERT_LABELS[level]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Alert list */}
      <FlatList
        data={displayAlerts}
        renderItem={renderAlert}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => fetchAlerts({ active: !showHistory })}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {showHistory ? 'No alert history' : 'No active alerts'}
            </Text>
            <Text style={styles.emptySubtext}>All clear</Text>
          </View>
        }
      />

      {/* Alert compose modal */}
      <Modal
        visible={reasonModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setReasonModal({ visible: false, level: null })}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {reasonModal.level ? ALERT_LABELS[reasonModal.level] : ''} Alert
            </Text>
            <Text style={styles.modalSubtitle}>
              Add an optional reason so your team knows what's happening.
            </Text>

            <TextInput
              style={styles.reasonInput}
              placeholder="e.g. Suspicious person near entrance"
              placeholderTextColor={COLORS.textMuted}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={200}
              autoFocus
            />

            {/* Scope selector */}
            {myAlertGroups.length > 0 && (
              <View style={styles.scopeSection}>
                <Text style={styles.scopeLabel}>Send to</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scopeScroll}>
                  {/* All Groups chip */}
                  <TouchableOpacity
                    style={[styles.groupChip, selectedGroupIds === null && styles.groupChipActive]}
                    onPress={setGlobal}
                  >
                    <Text style={[styles.groupChipText, selectedGroupIds === null && styles.groupChipTextActive]}>
                      All Groups
                    </Text>
                  </TouchableOpacity>

                  {myAlertGroups.map((g) => {
                    const selected = selectedGroupIds?.includes(g.id) ?? false;
                    return (
                      <TouchableOpacity
                        key={g.id}
                        style={[styles.groupChip, selected && styles.groupChipActive]}
                        onPress={() => toggleGroupSelection(g.id)}
                      >
                        <Text style={[styles.groupChipText, selected && styles.groupChipTextActive]}>
                          {g.name}
                          {g.type === 'lead' ? ' (Lead)' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <Text style={styles.scopeHint}>
                  {selectedGroupIds === null
                    ? 'Alert will be sent to all groups in your organization.'
                    : 'Lead groups automatically receive all sub-group alerts.'}
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setReasonModal({ visible: false, level: null })}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: modalColor }]}
                onPress={handleSendAlert}
                disabled={triggering}
              >
                <Text style={styles.sendButtonText}>Send Alert</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  historyToggle: { ...TYPOGRAPHY.bodySmall, color: COLORS.info, fontWeight: '600' },
  panicSection: { alignItems: 'center', paddingVertical: SPACING.md },
  panicButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.danger,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  panicIcon: { fontSize: 32, fontWeight: '900', color: COLORS.white },
  panicText: { ...TYPOGRAPHY.caption, color: COLORS.white, fontWeight: '800', letterSpacing: 2 },
  panicHint: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: SPACING.sm },
  levelRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  levelButton: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  levelButtonText: { ...TYPOGRAPHY.caption, color: COLORS.white, fontWeight: '700' },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  alertCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  levelBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: 4 },
  levelBadgeText: { ...TYPOGRAPHY.caption, color: COLORS.white, fontWeight: '700' },
  resolvedBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  resolvedBadgeText: { ...TYPOGRAPHY.caption, color: COLORS.white, fontWeight: '700' },
  scopeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: COLORS.gray700,
  },
  scopeBadgeText: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, fontWeight: '600' },
  alertMessage: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  alertMeta: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  ackCount: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: 4 },
  alertActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  ackButton: {
    flex: 1,
    backgroundColor: COLORS.info,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  ackButtonText: { ...TYPOGRAPHY.bodySmall, color: COLORS.white, fontWeight: '600' },
  resolveButton: {
    flex: 1,
    backgroundColor: COLORS.success,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  resolveButtonText: { ...TYPOGRAPHY.bodySmall, color: COLORS.white, fontWeight: '600' },
  errorContainer: { alignItems: 'center', paddingVertical: SPACING.sm },
  errorText: { ...TYPOGRAPHY.bodySmall, color: COLORS.danger },
  emptyContainer: { alignItems: 'center', paddingTop: SPACING.xxl },
  emptyText: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary },
  emptySubtext: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginTop: SPACING.xs },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
  },
  modalTitle: { ...TYPOGRAPHY.heading2, color: COLORS.textPrimary, marginBottom: SPACING.xs },
  modalSubtitle: { ...TYPOGRAPHY.bodySmall, color: COLORS.textMuted, marginBottom: SPACING.md },
  reasonInput: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    color: COLORS.textPrimary,
    padding: SPACING.md,
    minHeight: 70,
    textAlignVertical: 'top',
    ...TYPOGRAPHY.body,
    marginBottom: SPACING.md,
  },
  scopeSection: { marginBottom: SPACING.md },
  scopeLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  scopeScroll: { flexDirection: 'row' },
  groupChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    marginRight: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  groupChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + '22',
  },
  groupChipText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, fontWeight: '600' },
  groupChipTextActive: { color: COLORS.accent },
  scopeHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    lineHeight: 17,
  },
  modalActions: { flexDirection: 'row', gap: SPACING.sm },
  cancelButton: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
    backgroundColor: COLORS.gray700,
  },
  cancelButtonText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, fontWeight: '600' },
  sendButton: {
    flex: 2,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  sendButtonText: { ...TYPOGRAPHY.bodySmall, color: COLORS.white, fontWeight: '700' },
});
