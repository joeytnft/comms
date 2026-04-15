import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, TextInput, Share, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useGroupStore } from '@/store/useGroupStore';
import { useCampusStore } from '@/store/useCampusStore';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { useAuth } from '@/contexts/AuthContext';
import { MemberList } from '@/components/groups/MemberList';
import { LoadingOverlay, Button } from '@/components/common';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { GroupStackParamList } from '@/navigation/GroupStackNavigator';

type Props = {
  navigation: NativeStackNavigationProp<GroupStackParamList, 'GroupDetail'>;
  route: RouteProp<GroupStackParamList, 'GroupDetail'>;
};

export function GroupDetailScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
  const { user } = useAuth();
  const { currentGroup, isLoading, fetchGroup, addMember, removeMember, deleteGroup, updateGroup, generateInvite, revokeInvite, clearCurrentGroup, assignGroupCampus } = useGroupStore();
  const { campuses, fetchCampuses } = useCampusStore();
  const { subscription } = useSubscriptionStore();
  const isEnterprise = subscription?.tier === 'ENTERPRISE';
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [showCampusPicker, setShowCampusPicker] = useState(false);

  useEffect(() => {
    if (isEnterprise) fetchCampuses();
  }, [isEnterprise]);

  useFocusEffect(
    useCallback(() => {
      fetchGroup(groupId);
      return () => clearCurrentGroup();
    }, [groupId]),
  );

  const isAdmin = currentGroup?.members.some(
    (m) => m.userId === user?.id && m.role === 'admin',
  );

  const handleAddMember = async () => {
    if (!memberEmail.trim()) return;
    setIsAdding(true);
    try {
      await addMember({ groupId, email: memberEmail.trim(), role: 'member' });
      setMemberEmail('');
      setShowAddMember(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to add member';
      Alert.alert('Error', message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await removeMember(groupId, userId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to remove member';
      Alert.alert('Error', message);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Channel',
      `Are you sure you want to delete "${currentGroup?.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGroup(groupId);
              navigation.goBack();
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'Failed to delete channel';
              Alert.alert('Error', message);
            }
          },
        },
      ],
    );
  };

  const handleGenerateInvite = async () => {
    setIsGeneratingInvite(true);
    try {
      const code = await generateInvite(groupId);
      await Share.share({
        message: `Join my channel on GatherSafe! Use invite code: ${code}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to generate invite code';
      Alert.alert('Error', message);
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleShareInvite = async () => {
    if (!currentGroup?.inviteCode) return;
    try {
      await Share.share({
        message: `Join my channel on GatherSafe! Use invite code: ${currentGroup.inviteCode}`,
      });
    } catch {
      // User cancelled share
    }
  };

  const handleRevokeInvite = () => {
    Alert.alert(
      'Revoke Invite Code',
      'This will disable the current invite code. Anyone with the old code will no longer be able to join.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeInvite(groupId);
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'Failed to revoke invite';
              Alert.alert('Error', message);
            }
          },
        },
      ],
    );
  };

  if (isLoading && !currentGroup) {
    return <LoadingOverlay message="Loading channel..." />;
  }

  if (!currentGroup) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Channel not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Group header */}
        <View style={styles.groupHeader}>
          <View style={[styles.colorDot, { backgroundColor: currentGroup.iconColor || COLORS.accent }]} />
          <View style={styles.groupInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.groupName}>{currentGroup.name}</Text>
              <View style={[styles.typeBadge, currentGroup.type === 'lead' ? styles.leadBadge : styles.subBadge]}>
                <Text style={styles.typeText}>
                  {currentGroup.type === 'lead' ? 'LEAD CH' : 'SUB CH'}
                </Text>
              </View>
            </View>
            {currentGroup.description ? (
              <Text style={styles.description}>{currentGroup.description}</Text>
            ) : null}
            {currentGroup.campus && (
              <Text style={styles.campusLabel}>{currentGroup.campus.name}</Text>
            )}
            <Text style={styles.memberCount}>
              {currentGroup.memberCount} {currentGroup.memberCount === 1 ? 'member' : 'members'}
            </Text>
          </View>
        </View>

        {/* Action buttons */}
        <Button
          title="Open Chat"
          variant="primary"
          onPress={() => navigation.navigate('ChatRoom', { groupId, groupName: currentGroup.name })}
          style={styles.chatButton}
        />
        {currentGroup.type === 'lead' && isAdmin && (
          <Button
            title="+ Create Sub-Channel"
            variant="secondary"
            onPress={() => navigation.navigate('CreateGroup', { defaultParentGroupId: groupId, defaultType: 'sub' })}
            style={styles.subGroupButton}
          />
        )}

        {/* Invite section — admin only */}
        {isAdmin && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Invite Code</Text>
            </View>
            {currentGroup.inviteCode ? (
              <View>
                <View style={styles.inviteCodeRow}>
                  <Text style={styles.inviteCode}>{currentGroup.inviteCode}</Text>
                </View>
                <View style={styles.inviteActions}>
                  <TouchableOpacity style={styles.inviteActionBtn} onPress={handleShareInvite}>
                    <Text style={styles.inviteActionText}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.inviteActionBtn} onPress={handleGenerateInvite} disabled={isGeneratingInvite}>
                    <Text style={styles.inviteActionText}>Regenerate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.inviteActionBtn, styles.inviteRevokeBtn]} onPress={handleRevokeInvite}>
                    <Text style={styles.inviteRevokeText}>Revoke</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.noInviteText}>No active invite code</Text>
                <Button
                  title="Generate Invite Code"
                  onPress={handleGenerateInvite}
                  loading={isGeneratingInvite}
                  style={styles.generateButton}
                />
              </View>
            )}
          </View>
        )}

        {/* Permissions — admin only */}
        {isAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Permissions</Text>
            <View style={styles.permissionRow}>
              <View style={styles.permissionInfo}>
                <Text style={styles.permissionLabel}>Alerts</Text>
                <Text style={styles.permissionDesc}>
                  Members can send and receive emergency alerts
                </Text>
              </View>
              <Switch
                value={currentGroup.alertsEnabled}
                onValueChange={async (val) => {
                  try {
                    await updateGroup(groupId, { alertsEnabled: val });
                  } catch {
                    Alert.alert('Error', 'Failed to update permission');
                  }
                }}
                trackColor={{ false: COLORS.gray700, true: COLORS.accent + '80' }}
                thumbColor={currentGroup.alertsEnabled ? COLORS.accent : COLORS.gray500}
              />
            </View>
          </View>
        )}

        {/* Campus assignment — Enterprise + admin only */}
        {isEnterprise && isAdmin && campuses.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Campus</Text>
              <TouchableOpacity onPress={() => setShowCampusPicker(!showCampusPicker)}>
                <Text style={styles.addMemberText}>{showCampusPicker ? 'Cancel' : 'Change'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.campusCurrentText}>
              {currentGroup.campus?.name ?? 'All Campuses'}
            </Text>
            {showCampusPicker && (
              <View style={styles.campusPicker}>
                <TouchableOpacity
                  style={[styles.campusOption, !currentGroup.campusId && styles.campusOptionSelected]}
                  onPress={async () => {
                    try {
                      await assignGroupCampus(groupId, null);
                      setShowCampusPicker(false);
                    } catch {
                      Alert.alert('Error', 'Failed to update campus');
                    }
                  }}
                >
                  <Text style={[styles.campusOptionText, !currentGroup.campusId && styles.campusOptionTextSelected]}>
                    All Campuses
                  </Text>
                </TouchableOpacity>
                {campuses.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.campusOption, currentGroup.campusId === c.id && styles.campusOptionSelected]}
                    onPress={async () => {
                      try {
                        await assignGroupCampus(groupId, c.id);
                        setShowCampusPicker(false);
                      } catch {
                        Alert.alert('Error', 'Failed to update campus');
                      }
                    }}
                  >
                    <Text style={[styles.campusOptionText, currentGroup.campusId === c.id && styles.campusOptionTextSelected]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Members section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Members</Text>
            {isAdmin && (
              <TouchableOpacity onPress={() => setShowAddMember(!showAddMember)}>
                <Text style={styles.addMemberText}>
                  {showAddMember ? 'Cancel' : '+ Add'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {showAddMember && (
            <View style={styles.addMemberForm}>
              <TextInput
                style={styles.emailInput}
                placeholder="Enter member's email"
                placeholderTextColor={COLORS.gray500}
                value={memberEmail}
                onChangeText={setMemberEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Button
                title="Add"
                onPress={handleAddMember}
                loading={isAdding}
                disabled={!memberEmail.trim()}
                style={styles.addButton}
              />
            </View>
          )}

          <MemberList
            members={currentGroup.members}
            isAdmin={!!isAdmin}
            currentUserId={user?.id || ''}
            onRemoveMember={handleRemoveMember}
          />
        </View>

        {/* Admin actions */}
        {isAdmin && (
          <Button
            title="Delete Channel"
            variant="danger"
            onPress={handleDelete}
            style={styles.deleteButton}
          />
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
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  groupHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  colorDot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: SPACING.md,
  },
  groupInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  groupName: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
  },
  typeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  leadBadge: {
    backgroundColor: COLORS.accent,
  },
  subBadge: {
    backgroundColor: COLORS.gray700,
  },
  typeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 10,
  },
  description: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  campusLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.info,
    fontWeight: '600',
    marginTop: 2,
  },
  memberCount: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
  },
  addMemberText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.info,
    fontWeight: '600',
  },
  addMemberForm: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  emailInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.gray700,
  },
  addButton: {
    paddingHorizontal: SPACING.md,
    minHeight: 40,
  },
  chatButton: {
    marginBottom: SPACING.sm,
  },
  subGroupButton: {
    marginBottom: SPACING.lg,
  },
  inviteCodeRow: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray700,
    borderStyle: 'dashed',
  },
  inviteCode: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.accent,
    letterSpacing: 3,
    fontWeight: '700',
  },
  inviteActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  inviteActionBtn: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray700,
  },
  inviteActionText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.info,
    fontWeight: '600',
  },
  inviteRevokeBtn: {
    borderColor: COLORS.danger,
  },
  inviteRevokeText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.danger,
    fontWeight: '600',
  },
  noInviteText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  generateButton: {
    marginTop: SPACING.xs,
  },
  deleteButton: {
    marginTop: SPACING.md,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  permissionInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  permissionLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  permissionDesc: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  errorText: {
    ...TYPOGRAPHY.body,
    color: COLORS.danger,
    textAlign: 'center',
    marginTop: SPACING.xxl,
  },
  campusCurrentText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  campusPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  campusOption: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 2,
    borderColor: COLORS.gray700,
  },
  campusOptionSelected: {
    borderColor: COLORS.accent,
  },
  campusOptionText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  campusOptionTextSelected: {
    color: COLORS.accent,
  },
});
