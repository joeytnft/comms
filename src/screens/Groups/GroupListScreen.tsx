import React, { useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useGroupStore } from '@/store/useGroupStore';
import { GroupCard } from '@/components/groups/GroupCard';
import { LoadingOverlay } from '@/components/common';
import { Group } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING } from '@/config/theme';
import { GroupStackParamList } from '@/navigation/GroupStackNavigator';

type Props = {
  navigation: NativeStackNavigationProp<GroupStackParamList, 'GroupList'>;
};

export function GroupListScreen({ navigation }: Props) {
  const { groups, isLoading, error, fetchGroups } = useGroupStore();

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

  if (isLoading && groups.length === 0) {
    return <LoadingOverlay message="Loading groups..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>
        <TouchableOpacity style={styles.createButton} onPress={handleCreatePress}>
          <Text style={styles.createButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

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
