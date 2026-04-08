import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable, Share, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { Button } from '@/components/common';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { APP_VERSION } from '@/config/constants';

export function SettingsScreen() {
  const { user, organization, logout } = useAuth();
  const { tierLabel } = useSubscriptionStore();
  const navigation = useNavigation<any>();

  const handleShareInvite = async () => {
    if (!organization?.inviteCode) return;
    try {
      await Share.share({
        message: `Join ${organization.name} on Guardian Comm!\n\nDownload the app and use this invite code when registering:\n\n${organization.inviteCode}`,
      });
    } catch {
      // User cancelled
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.name}>{user?.displayName || 'Team Member'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        {/* Settings sections */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Email</Text>
            <Text style={styles.settingValue}>{user?.email}</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Phone</Text>
            <Text style={styles.settingValue}>{user?.phone || 'Not set'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <Pressable
            style={styles.settingRow}
            onPress={() => navigation.navigate('Subscription')}
          >
            <Text style={styles.settingLabel}>Current Plan</Text>
            <View style={styles.tierRow}>
              <Text style={styles.tierBadge}>{tierLabel()}</Text>
              <Text style={styles.chevron}>{'>'}</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Features</Text>
          <Pressable
            style={styles.settingRow}
            onPress={() => navigation.navigate('TeamMap')}
          >
            <Text style={styles.settingLabel}>Team Map</Text>
            <Text style={styles.chevron}>{'>'}</Text>
          </Pressable>
          <Pressable
            style={styles.settingRow}
            onPress={() => navigation.navigate('Incidents')}
          >
            <Text style={styles.settingLabel}>Incidents</Text>
            <Text style={styles.chevron}>{'>'}</Text>
          </Pressable>
          <Pressable
            style={styles.settingRow}
            onPress={() => navigation.navigate('Geofence')}
          >
            <Text style={styles.settingLabel}>Geofence</Text>
            <Text style={styles.chevron}>{'>'}</Text>
          </Pressable>
          <Pressable
            style={styles.settingRow}
            onPress={() => navigation.navigate('PTTConfig')}
          >
            <Text style={styles.settingLabel}>PTT Button</Text>
            <Text style={styles.chevron}>{'>'}</Text>
          </Pressable>
          <Pressable
            style={styles.settingRow}
            onPress={() => navigation.navigate('Schedule')}
          >
            <Text style={styles.settingLabel}>Schedule & Check-In</Text>
            <Text style={styles.chevron}>{'>'}</Text>
          </Pressable>
        </View>

        {organization && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Team</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Organization</Text>
              <Text style={styles.settingValue}>{organization.name}</Text>
            </View>
            <View style={styles.inviteRow}>
              <View style={styles.inviteCodeBox}>
                <Text style={styles.inviteCodeLabel}>Invite Code</Text>
                <Text style={styles.inviteCode}>{organization.inviteCode}</Text>
              </View>
              <TouchableOpacity style={styles.shareButton} onPress={handleShareInvite}>
                <Text style={styles.shareButtonText}>Share</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.inviteHint}>
              Share this code with team members so they can join your organization when registering.
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Version</Text>
            <Text style={styles.settingValue}>{APP_VERSION}</Text>
          </View>
        </View>

        {/* Logout */}
        <Button
          title="Sign Out"
          variant="danger"
          onPress={handleLogout}
          style={styles.logoutButton}
        />
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
  headerTitle: {
    ...TYPOGRAPHY.heading1,
    color: COLORS.textPrimary,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  avatarText: {
    ...TYPOGRAPHY.heading1,
    color: COLORS.white,
  },
  name: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
  },
  email: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  settingLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  settingValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  tierBadge: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.info,
    fontWeight: '600',
  },
  chevron: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
  },
  logoutButton: {
    marginTop: SPACING.lg,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
  },
  inviteCodeBox: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    borderStyle: 'dashed',
  },
  inviteCodeLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  inviteCode: {
    ...TYPOGRAPHY.body,
    color: COLORS.accent,
    fontWeight: '700',
    letterSpacing: 1,
  },
  shareButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  shareButtonText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.white,
    fontWeight: '600',
  },
  inviteHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginTop: SPACING.xs,
  },
});
