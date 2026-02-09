import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { GroupMember } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '@/config/theme';

interface MemberListProps {
  members: GroupMember[];
  isAdmin: boolean;
  currentUserId: string;
  onRemoveMember?: (userId: string) => void;
}

export function MemberList({ members, isAdmin, currentUserId, onRemoveMember }: MemberListProps) {
  const handleRemove = (member: GroupMember) => {
    Alert.alert(
      'Remove Member',
      `Remove ${member.user.displayName} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onRemoveMember?.(member.userId),
        },
      ],
    );
  };

  const renderMember = ({ item }: { item: GroupMember }) => {
    const isSelf = item.userId === currentUserId;

    return (
      <View style={styles.memberRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.user.displayName?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{item.user.displayName}</Text>
            {isSelf && <Text style={styles.youBadge}>You</Text>}
          </View>
          <View style={styles.metaRow}>
            <View style={[styles.roleBadge, item.role === 'admin' ? styles.adminBadge : styles.memberBadge]}>
              <Text style={styles.roleText}>{item.role === 'admin' ? 'Admin' : 'Member'}</Text>
            </View>
            {item.user.lastSeenAt && (
              <Text style={styles.lastSeen}>
                {getLastSeenText(item.user.lastSeenAt)}
              </Text>
            )}
          </View>
        </View>
        {isAdmin && !isSelf && (
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => handleRemove(item)}
          >
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <FlatList
      data={members}
      renderItem={renderMember}
      keyExtractor={(item) => item.id || item.userId}
      scrollEnabled={false}
    />
  );
}

function getLastSeenText(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Online';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

const styles = StyleSheet.create({
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    ...TYPOGRAPHY.body,
    color: COLORS.white,
    fontWeight: '600',
  },
  info: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  name: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  youBadge: {
    ...TYPOGRAPHY.caption,
    color: COLORS.info,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.sm,
  },
  adminBadge: {
    backgroundColor: COLORS.accent,
  },
  memberBadge: {
    backgroundColor: COLORS.gray700,
  },
  roleText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '600',
  },
  lastSeen: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  removeButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  removeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.danger,
    fontWeight: '600',
  },
});
