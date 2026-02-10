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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAlertStore } from '@/store/useAlertStore';
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
  const [showHistory, setShowHistory] = useState(false);
  const [triggering, setTriggering] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchAlerts({ active: true });
    }, []),
  );

  const handleTriggerAlert = (level: AlertLevel) => {
    const label = ALERT_LABELS[level];
    RNAlert.alert(
      `Trigger ${label} Alert`,
      `This will notify all team members with a ${label.toLowerCase()} alert. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Alert',
          style: 'destructive',
          onPress: async () => {
            setTriggering(true);
            try {
              await triggerAlert({ level });
              Vibration.vibrate(200);
            } catch {
              RNAlert.alert('Error', 'Failed to trigger alert');
            } finally {
              setTriggering(false);
            }
          },
        },
      ],
    );
  };

  const handlePanicPress = () => {
    Vibration.vibrate(100);
    handleTriggerAlert('EMERGENCY');
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
    if (!showHistory) {
      fetchAlerts();
    }
    setShowHistory(!showHistory);
  };

  const displayAlerts = showHistory ? alerts : activeAlerts;
  const userId = user?.id;

  const renderAlert = ({ item }: { item: Alert }) => {
    const isAcked = item.acknowledgments.some((a) => a.userId === userId);
    const isResolved = !!item.resolvedAt;
    const color = ALERT_COLORS[item.level];

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
        </View>

        {item.message && <Text style={styles.alertMessage}>{item.message}</Text>}

        <Text style={styles.alertMeta}>
          Triggered by {item.triggeredBy.displayName} {'\u00B7'}{' '}
          {new Date(item.createdAt).toLocaleTimeString()}
        </Text>

        <Text style={styles.ackCount}>
          {item.acknowledgments.length} acknowledged
        </Text>

        {!isResolved && (
          <View style={styles.alertActions}>
            {!isAcked && (
              <TouchableOpacity
                style={styles.ackButton}
                onPress={() => handleAcknowledge(item.id)}
              >
                <Text style={styles.ackButtonText}>Acknowledge</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.resolveButton}
              onPress={() => handleResolve(item.id)}
            >
              <Text style={styles.resolveButtonText}>Resolve</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
        <TouchableOpacity onPress={handleShowHistory}>
          <Text style={styles.historyToggle}>
            {showHistory ? 'Active Only' : 'History'}
          </Text>
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
            onPress={() => handleTriggerAlert(level)}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  title: {
    ...TYPOGRAPHY.heading1,
    color: COLORS.textPrimary,
  },
  historyToggle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.info,
    fontWeight: '600',
  },
  panicSection: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  panicButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.danger,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  panicIcon: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.white,
  },
  panicText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.white,
    fontWeight: '800',
    letterSpacing: 2,
  },
  panicHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
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
  levelButtonText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.white,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
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
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  levelBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  levelBadgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.white,
    fontWeight: '700',
  },
  resolvedBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  resolvedBadgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.white,
    fontWeight: '700',
  },
  alertMessage: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  alertMeta: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  ackCount: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  alertActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  ackButton: {
    flex: 1,
    backgroundColor: COLORS.info,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  ackButtonText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.white,
    fontWeight: '600',
  },
  resolveButton: {
    flex: 1,
    backgroundColor: COLORS.success,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  resolveButtonText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.white,
    fontWeight: '600',
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  errorText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.danger,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: SPACING.xxl,
  },
  emptyText: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
  },
  emptySubtext: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
});
