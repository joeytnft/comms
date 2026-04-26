import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/MoreStackNavigator';

type Props = {
  navigation: NativeStackNavigationProp<MoreStackParamList, 'NotificationSettings'>;
};

type PermStatus = 'granted' | 'denied' | 'unknown';

interface PermState {
  notifications: PermStatus;
  criticalAlerts: PermStatus; // iOS only
}

function statusLabel(s: PermStatus): string {
  if (s === 'granted') return 'Enabled';
  if (s === 'denied') return 'Disabled';
  return 'Unknown';
}

function statusColor(s: PermStatus): string {
  if (s === 'granted') return COLORS.success;
  if (s === 'denied') return COLORS.danger;
  return COLORS.textMuted;
}

export function NotificationSettingsScreen({ navigation }: Props) {
  const [perms, setPerms] = useState<PermState>({
    notifications: 'unknown',
    criticalAlerts: 'unknown',
  });

  const checkPermissions = useCallback(async () => {
    const { status, ios } = await Notifications.getPermissionsAsync();
    setPerms({
      notifications: status === 'granted' ? 'granted' : 'denied',
      criticalAlerts:
        Platform.OS === 'ios'
          ? (ios?.allowsCriticalAlerts ? 'granted' : 'denied')
          : 'granted', // Android handles this at the channel level
    });
  }, []);

  // Re-check each time the screen is focused so returning from iOS Settings
  // reflects the latest state without requiring a restart.
  useFocusEffect(
    useCallback(() => {
      checkPermissions();
    }, [checkPermissions]),
  );

  const openSettings = () => Linking.openSettings();

  const requestCriticalAlerts = useCallback(async () => {
    const { ios } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowCriticalAlerts: true,
      },
    });
    if (ios?.allowsCriticalAlerts) {
      await checkPermissions();
    } else {
      Alert.alert(
        'Critical Alerts',
        'iOS did not show the permission dialog — this can happen when the permission was already determined on a previous install.\n\nTo enable Critical Alerts:\n1. Delete the app\n2. Reinstall from TestFlight\n3. Tap "Allow" on both permission dialogs that appear\n\nOr go to Settings → GatherSafe → Notifications → Critical Alerts if the toggle is already there.',
        [
          { text: 'Open Settings', onPress: openSettings },
          { text: 'OK', style: 'cancel' },
        ],
      );
    }
  }, [checkPermissions, openSettings]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>{'‹'} Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Permission status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PERMISSION STATUS</Text>

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Notifications</Text>
              <Text style={styles.rowSub}>Alerts, messages, and activity</Text>
            </View>
            <Text style={[styles.statusBadge, { color: statusColor(perms.notifications) }]}>
              {statusLabel(perms.notifications)}
            </Text>
          </View>

          {Platform.OS === 'ios' && (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Critical Alerts</Text>
                <Text style={styles.rowSub}>Bypass Silent mode and Do Not Disturb</Text>
              </View>
              <Text style={[styles.statusBadge, { color: statusColor(perms.criticalAlerts) }]}>
                {statusLabel(perms.criticalAlerts)}
              </Text>
            </View>
          )}
        </View>

        {/* Critical alerts explainer — iOS only */}
        {Platform.OS === 'ios' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ABOUT CRITICAL ALERTS</Text>
            <View style={styles.card}>
              <Text style={styles.cardBody}>
                Critical Alerts are a special iOS permission that allows life-safety notifications
                — like Active Shooter alerts — to sound and vibrate even when your phone is on
                Silent or Do Not Disturb.
              </Text>
              <Text style={[styles.cardBody, { marginTop: SPACING.sm }]}>
                Apple requires you to grant this permission separately. GatherSafe requests it
                automatically on first launch. If you dismissed that prompt or disabled it later,
                you need to re-enable it in iOS Settings.
              </Text>
            </View>

            {perms.criticalAlerts === 'denied' && (
              <View style={styles.warningCard}>
                <Text style={styles.warningTitle}>Critical Alerts are off</Text>
                <Text style={styles.warningBody}>
                  Emergency alerts will not override Silent mode or Do Not Disturb. Tap
                  "Request Permission" below — iOS will show a dialog to enable them.
                </Text>
                <TouchableOpacity style={styles.settingsButton} onPress={requestCriticalAlerts}>
                  <Text style={styles.settingsButtonText}>Request Permission</Text>
                </TouchableOpacity>
                <Text style={styles.settingsHint}>
                  If no dialog appears, go to{' '}
                  <Text style={styles.settingsHintBold}>Settings → GatherSafe → Notifications → Critical Alerts</Text>
                  {' '}to enable it manually. If that toggle is missing, reinstall the app from TestFlight and allow both permission dialogs on first launch.
                </Text>
              </View>
            )}

            {perms.criticalAlerts === 'granted' && (
              <View style={styles.successCard}>
                <Text style={styles.successText}>
                  Critical Alerts are enabled. Emergency notifications will sound even when your
                  phone is silenced.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Android explainer */}
        {Platform.OS === 'android' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CRITICAL SAFETY ALERTS</Text>
            <View style={styles.card}>
              <Text style={styles.cardBody}>
                On Android, critical alerts are handled via the{' '}
                <Text style={styles.bold}>Critical Safety Alerts</Text> notification channel, which
                is configured to bypass Do Not Disturb automatically.
              </Text>
              <Text style={[styles.cardBody, { marginTop: SPACING.sm }]}>
                If you have disabled this channel in system settings, Active Shooter and other
                emergency alerts may not sound. Tap below to review your channel settings.
              </Text>
            </View>
            <TouchableOpacity style={styles.settingsButton} onPress={openSettings}>
              <Text style={styles.settingsButtonText}>Open App Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* General notifications disabled */}
        {perms.notifications === 'denied' && (
          <View style={styles.section}>
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>Notifications are off</Text>
              <Text style={styles.warningBody}>
                You will not receive any alerts, messages, or activity notifications from
                GatherSafe while notifications are disabled.
              </Text>
              <TouchableOpacity style={styles.settingsButton} onPress={openSettings}>
                <Text style={styles.settingsButtonText}>Enable Notifications</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  backButton: {
    marginBottom: SPACING.xs,
  },
  backText: {
    ...TYPOGRAPHY.body,
    color: COLORS.info,
  },
  headerTitle: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.textPrimary,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  section: {
    gap: SPACING.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  rowText: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  rowLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  rowSub: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '700',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  cardBody: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  bold: {
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  warningCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.danger,
    padding: SPACING.md,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  warningTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.danger,
    fontWeight: '700',
  },
  warningBody: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  successCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.success,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  successText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  settingsButton: {
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  settingsButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.white,
    fontWeight: '700',
  },
  settingsHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: SPACING.xs,
  },
  settingsHintBold: {
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
});
