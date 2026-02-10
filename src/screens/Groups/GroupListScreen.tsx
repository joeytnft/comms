import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useGroupStore } from '@/store/useGroupStore';
import { GroupCard } from '@/components/groups/GroupCard';
import { LoadingOverlay } from '@/components/common';
import { Group } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';
import { GroupStackParamList } from '@/navigation/GroupStackNavigator';

type Props = {
  navigation: NativeStackNavigationProp<GroupStackParamList, 'GroupList'>;
};

export function GroupListScreen({ navigation }: Props) {
  const { groups, isLoading, error, fetchGroups, joinByInvite } = useGroupStore();
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchGroups();
    }, []),
  );

  const handleGroupPress = (group: Group) => {
    navigation.navigate('GroupDetail', { groupId: group.id });
  };

  const handleCreatePress = () => {
    navigation.navigate('CreateGroup');
  };

  const handleJoinByCode = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return;
    setIsJoining(true);
    try {
      await joinByInvite(code);
      setInviteCode('');
      setShowJoinForm(false);
      Alert.alert('Joined!', 'You have successfully joined the group.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to join group';
      Alert.alert('Error', message);
    } finally {
      setIsJoining(false);
    }
  };

  if (isLoading && groups.length === 0) {
    return <LoadingOverlay message="Loading groups..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.joinButton}
            onPress={() => setShowJoinForm(!showJoinForm)}
          >
            <Text style={styles.joinButtonText}>{showJoinForm ? 'Cancel' : 'Join'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.createButton} onPress={handleCreatePress}>
            <Text style={styles.createButtonText}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showJoinForm && (
        <View style={styles.joinForm}>
          <TextInput
            style={styles.joinInput}
            placeholder="Enter invite code"
            placeholderTextColor={COLORS.textMuted}
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="characters"
            maxLength={8}
          />
          <TouchableOpacity
            style={[styles.joinSubmitButton, (!inviteCode.trim() || isJoining) && styles.joinSubmitDisabled]}
            onPress={handleJoinByCode}
            disabled={!inviteCode.trim() || isJoining}
          >
            <Text style={styles.joinSubmitText}>{isJoining ? 'Joining...' : 'Join Group'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchGroups}>
            <Text style={styles.retryText}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={groups}
        renderItem={({ item }) => <GroupCard group={item} onPress={handleGroupPress} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={fetchGroups}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptySubtext}>
              Create your first group to get your team organized.
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={handleCreatePress}>
              <Text style={styles.emptyButtonText}>Create Group</Text>
            </TouchableOpacity>
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
  headerActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  joinButton: {
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  joinButtonText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.accent,
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  createButtonText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.white,
    fontWeight: '600',
  },
  joinForm: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  joinInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.gray700,
    letterSpacing: 2,
  },
  joinSubmitButton: {
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    justifyContent: 'center',
  },
  joinSubmitDisabled: {
    opacity: 0.5,
  },
  joinSubmitText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.white,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  errorText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.danger,
  },
  retryText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.info,
    marginTop: SPACING.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: SPACING.xxl * 2,
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
  },
  emptySubtext: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  emptyButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 4,
    borderRadius: 8,
    marginTop: SPACING.lg,
  },
  emptyButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.white,
  },
});
