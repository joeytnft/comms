import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable, Share, TouchableOpacity, Linking, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { useAppLock } from '@/contexts/AppLockContext';
import { Button } from '@/components/common';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { APP_VERSION } from '@/config/constants';

export function SettingsScreen() {
  const { user, organization, logout } = useAuth();
  const { tierLabel, subscription, canUseFeature } = useSubscriptionStore();
  const { isPinEnabled, refreshPinStatus } = useAppLock();
  const isEnterprise = subscription?.tier === 'PRO';
  const isOrgAdmin = user?.role === 'owner' || user?.role === 'admin';
  const hasPcoAddon = isOrgAdmin; // Visible to all org owners/admins; connection optional
  const navigation = useNavigation<any>();

  const handleSchedulePress = () => {
    if (!canUseFeature('scheduling')) {
      Alert.alert(
        'Paid Feature',
        'Schedule & Check-In is available on Basic, Standard, and Enterprise plans. Upgrade to unlock it.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'View Plans', onPress: () => navigation.navigate('Subscription') },
        ],
      );
      return;
    }
    navigation.navigate('Schedule');
  };

  const handleShareInvite = async () => {
    if (!organization?.inviteCode) return;
    try {
      await Share.share({
        message: `Join ${organization.name} on GatherSafe!\n\nDownload the app and use this invite code when registering:\n\n${organization.inviteCode}`,
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
        <Pressable style={styles.profileCard} onPress={() => navigation.navigate('EditProfile')}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <Text style={styles.name}>{user?.displayName || 'Team Member'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <Text style={styles.editHint}>Tap to edit profile</Text>
        </Pressable>

        {/* Settings sections */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Pressable
            style={styles.settingRow}
            onPress={() => user?.email && Linking.openURL(`mailto:${user.email}`)}
          >
            <Text style={styles.settingLabel}>Email</Text>
            <Text style={[styles.settingValue, styles.linkValue]}>{user?.email}</Text>
          </Pressable>
          <Pressable
            style={styles.settingRow}
            onPress={() => user?.phone && Linking.openURL(`tel:${user.phone}`)}
            disabled={!user?.phone}
          >
            <Text style={styles.settingLabel}>Phone</Text>
            <Text style={[styles.settingValue, user?.phone && styles.linkValue]}>
              {user?.phone || 'Not set'}
            </Text>
          </Pressable>
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
          {isOrgAdmin && (
            <Pressable
              style={styles.settingRow}
              onPress={() => navigation.navigate('Geofence')}
            >
              <Text style={styles.settingLabel}>Geofence</Text>
              <Text style={styles.chevron}>{'>'}</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.settingRow}
            onPress={() => navigation.navigate('PTTConfig')}
          >
            <Text style={styles.settingLabel}>PTT Button</Text>
            <Text style={styles.chevron}>{'>'}</Text>
          </Pressable>
          <Pressable
            style={styles.settingRow}
            onPress={handleSchedulePress}
          >
            <Text style={styles.settingLabel}>Schedule & Check-In</Text>
            <Text style={styles.chevron}>{'>'}</Text>
          </Pressable>
          {isEnterprise && (
            <Pressable
              style={styles.settingRow}
              onPress={() => navigation.navigate('CampusManagement')}
            >
              <Text style={styles.settingLabel}>Campus Management</Text>
              <Text style={styles.chevron}>{'>'}</Text>
            </Pressable>
          )}
          {isOrgAdmin && (
            <Pressable
              style={styles.settingRow}
              onPress={() => navigation.navigate('Members')}
            >
              <Text style={styles.settingLabel}>Manage Members</Text>
              <Text style={styles.chevron}>{'>'}</Text>
            </Pressable>
          )}
          {hasPcoAddon && (
            <Pressable
              style={styles.settingRow}
              onPress={() => navigation.navigate('PlanningCenter')}
            >
              <Text style={styles.settingLabel}>Planning Center</Text>
              <Text style={styles.chevron}>{'>'}</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.settingRow}
            onPress={() => navigation.navigate('Training')}
          >
            <Text style={styles.settingLabel}>Training Events</Text>
            <Text style={styles.chevron}>{'>'}</Text>
          </Pressable>
          {isOrgAdmin && (
            <Pressable
              style={styles.settingRow}
              onPress={() => navigation.navigate('Training', { screen: 'QualificationTypes' })}
            >
              <Text style={styles.settingLabel}>Qualification Types</Text>
              <Text style={styles.chevron}>{'>'}</Text>
            </Pressable>
          )}
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
          <Text style={styles.sectionTitle}>Security</Text>
          <Pressable
            style={styles.settingRow}
            onPress={async () => {
              await navigation.navigate('PinSetup');
              refreshPinStatus();
            }}
          >
            <Text style={styles.settingLabel}>App Lock (PIN)</Text>
            <View style={styles.tierRow}>
              <Text style={[styles.tierBadge, { color: isPinEnabled ? COLORS.success : COLORS.textMuted }]}>
                {isPinEnabled ? 'Enabled' : 'Disabled'}
              </Text>
              <Text style={styles.chevron}>{'>'}</Text>
            </View>
          </Pressable>
        </View>

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
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
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
  editHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
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
  linkValue: {
    color: COLORS.info,
    textDecorationLine: 'underline',
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
