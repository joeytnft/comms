import React, { useRef, useCallback } from 'react';
import { FlatList, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MessageBubble } from './MessageBubble';
import { COLORS, TYPOGRAPHY, SPACING } from '@/config/theme';

interface Message {
  id: string;
  groupId: string;
  senderId: string;
  type: string;
  content: string;
  iv: string;
  createdAt: string;
  sender: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  isPending?: boolean;
}

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  typingUsers?: string[];
}

export function MessageList({
  messages,
  currentUserId,
  isLoading,
  hasMore,
  onLoadMore,
  typingUsers,
}: MessageListProps) {
  const flatListRef = useRef<FlatList>(null);

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isOwn = item.senderId === currentUserId;
      // Show sender name if it's a different sender than the previous message
      const prevMessage = index > 0 ? messages[index - 1] : null;
      const showSender = !isOwn && (!prevMessage || prevMessage.senderId !== item.senderId);

      return (
        <MessageBubble
          content={item.content}
          senderName={item.sender.displayName}
          timestamp={item.createdAt}
          isOwn={isOwn}
          isPending={item.isPending}
          showSender={showSender}
        />
      );
    },
    [currentUserId, messages],
  );

  const renderHeader = useCallback(() => {
    if (isLoading && messages.length === 0) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      );
    }
    if (hasMore) {
      return (
        <View style={styles.loadMore}>
          <ActivityIndicator color={COLORS.textMuted} size="small" />
        </View>
      );
    }
    return null;
  }, [isLoading, messages.length, hasMore]);

  const renderFooter = useCallback(() => {
    if (typingUsers && typingUsers.length > 0) {
      return (
        <View style={styles.typingContainer}>
          <Text style={styles.typingText}>
            {typingUsers.length === 1
              ? `Someone is typing...`
              : `${typingUsers.length} people are typing...`}
          </Text>
        </View>
      );
    }
    return null;
  }, [typingUsers]);

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No messages yet</Text>
        <Text style={styles.emptySubtext}>Send the first message to start the conversation</Text>
      </View>
    );
  }, [isLoading]);

  return (
    <FlatList
      ref={flatListRef}
      data={messages}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={renderHeader}
      ListFooterComponent={renderFooter}
      ListEmptyComponent={renderEmpty}
      onEndReached={hasMore ? onLoadMore : undefined}
      onEndReachedThreshold={0.3}
      inverted={false}
      contentContainerStyle={messages.length === 0 ? styles.emptyList : styles.list}
      onContentSizeChange={() => {
        if (messages.length > 0) {
          flatListRef.current?.scrollToEnd({ animated: false });
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: SPACING.sm,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  loadMore: {
    padding: SPACING.md,
    alignItems: 'center',
  },
  typingContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  typingText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  emptySubtext: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
