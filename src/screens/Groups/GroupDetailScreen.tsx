import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useGroupStore } from '@/store/useGroupStore';
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
  const { currentGroup, isLoading, fetchGroup, addMember, removeMember, deleteGroup, clearCurrentGroup } = useGroupStore();
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [isAdding, setIsAdding] = useState(false);

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
      'Delete Group',
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
              const message = error instanceof Error ? error.message : 'Failed to delete group';
              Alert.alert('Error', message);
            }
          },
        },
      ],
    );
  };

  if (isLoading && !currentGroup) {
    return <LoadingOverlay message="Loading group..." />;
  }

  if (!currentGroup) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Group not found</Text>
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
                  {currentGroup.type === 'lead' ? 'LEAD' : 'SUB'}
                </Text>
              </View>
            </View>
            {currentGroup.description ? (
              <Text style={styles.description}>{currentGroup.description}</Text>
            ) : null}
            <Text style={styles.memberCount}>
              {currentGroup.memberCount} {currentGroup.memberCount === 1 ? 'member' : 'members'}
            </Text>
          </View>
        </View>

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
            title="Delete Group"
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
  deleteButton: {
    marginTop: SPACING.md,
  },
  errorText: {
    ...TYPOGRAPHY.body,
    color: COLORS.danger,
    textAlign: 'center',
    marginTop: SPACING.xxl,
  },
});
