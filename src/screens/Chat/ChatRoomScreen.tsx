import React, { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { useChatStore } from '@/store/useChatStore';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { COLORS, TYPOGRAPHY, SPACING } from '@/config/theme';
import { GroupStackParamList } from '@/navigation/GroupStackNavigator';

type Props = {
  navigation: NativeStackNavigationProp<GroupStackParamList, 'ChatRoom'>;
  route: RouteProp<GroupStackParamList, 'ChatRoom'>;
};

export function ChatRoomScreen({ navigation, route }: Props) {
  const { groupId, groupName } = route.params;
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const {
    messagesByGroup,
    cursors,
    isLoading,
    typingUsers,
    fetchMessages,
    fetchMore,
    sendMessage,
    receiveMessage,
    setTyping,
    markRead,
  } = useChatStore();

  const messages = messagesByGroup[groupId] || [];
  const hasMore = !!cursors[groupId];
  const groupTypingUsers = typingUsers[groupId] || [];

  // Fetch messages on mount
  useEffect(() => {
    fetchMessages(groupId);
  }, [groupId]);

  // Join socket room and set up listeners
  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.emit('join_group', { groupId });

    const handleNewMessage = (message: any) => {
      if (message.groupId === groupId || message.fromSubGroup === groupId) {
        receiveMessage(message);
      }
    };

    const handleTyping = (data: { userId: string; groupId: string; isTyping: boolean }) => {
      if (data.groupId === groupId && data.userId !== user?.id) {
        setTyping(groupId, data.userId, data.isTyping);
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('user_typing', handleTyping);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('user_typing', handleTyping);
      socket.emit('leave_group', { groupId });
    };
  }, [socket, isConnected, groupId]);

  // Mark unread messages as read
  useEffect(() => {
    const unreadIds = messages
      .filter((m) => m.senderId !== user?.id && !m.isPending)
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      markRead(groupId, unreadIds);
    }
  }, [messages.length]);

  const handleSend = useCallback(
    (text: string) => {
      if (!user) return;
      sendMessage(groupId, text, user.id, user.displayName);
    },
    [groupId, user],
  );

  const handleTypingChange = useCallback(
    (isTyping: boolean) => {
      if (socket && isConnected) {
        socket.emit('typing', { groupId, isTyping });
      }
    },
    [socket, isConnected, groupId],
  );

  const handleLoadMore = useCallback(() => {
    fetchMore(groupId);
  }, [groupId]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>{'<'}</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{groupName}</Text>
          <Text style={styles.headerSubtitle}>
            {isConnected ? 'Connected' : 'Connecting...'}
          </Text>
        </View>
      </View>

      {/* Messages */}
      <View style={styles.messageArea}>
        <MessageList
          messages={messages}
          currentUserId={user?.id || ''}
          isLoading={isLoading}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          typingUsers={groupTypingUsers}
        />
      </View>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onTypingChange={handleTypingChange}
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
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray700,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  backText: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.info,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  messageArea: {
    flex: 1,
  },
});
