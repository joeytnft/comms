import { create } from 'zustand';
import { chatService, MessageData } from '@/services/chatService';
import { encryptMessage, decryptMessage, getGroupKey, initGroupKey } from '@/crypto/utils';

interface DecryptedMessage extends Omit<MessageData, 'encryptedContent'> {
  content: string;
  isPending?: boolean;
}

interface ChatState {
  // Messages keyed by groupId
  messagesByGroup: Record<string, DecryptedMessage[]>;
  cursors: Record<string, string | null>;
  isLoading: boolean;
  error: string | null;
  typingUsers: Record<string, string[]>; // groupId -> userIds

  // Actions
  fetchMessages: (groupId: string) => Promise<void>;
  fetchMore: (groupId: string) => Promise<void>;
  sendMessage: (groupId: string, plaintext: string, senderId: string, senderName: string) => Promise<void>;
  receiveMessage: (message: MessageData) => Promise<void>;
  setTyping: (groupId: string, userId: string, isTyping: boolean) => void;
  markRead: (groupId: string, messageIds: string[]) => Promise<void>;
  clearGroup: (groupId: string) => void;
}

async function ensureGroupKey(groupId: string): Promise<string> {
  let key = await getGroupKey(groupId);
  if (!key) {
    key = await initGroupKey(groupId);
  }
  return key;
}

async function decryptMessages(messages: MessageData[], groupKey: string): Promise<DecryptedMessage[]> {
  return Promise.all(
    messages.map(async (msg) => {
      try {
        const content = await decryptMessage(msg.encryptedContent, msg.iv, groupKey);
        return { ...msg, content, encryptedContent: undefined } as unknown as DecryptedMessage;
      } catch {
        return { ...msg, content: '[Unable to decrypt]', encryptedContent: undefined } as unknown as DecryptedMessage;
      }
    }),
  );
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesByGroup: {},
  cursors: {},
  isLoading: false,
  error: null,
  typingUsers: {},

  fetchMessages: async (groupId: string) => {
    set({ isLoading: true, error: null });
    try {
      const groupKey = await ensureGroupKey(groupId);
      const { messages, nextCursor } = await chatService.getMessages(groupId);

      // Messages come newest-first from API; reverse for display (oldest first)
      const reversed = [...messages].reverse();
      const decrypted = await decryptMessages(reversed, groupKey);

      set((state) => ({
        messagesByGroup: { ...state.messagesByGroup, [groupId]: decrypted },
        cursors: { ...state.cursors, [groupId]: nextCursor },
        isLoading: false,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch messages';
      set({ error: message, isLoading: false });
    }
  },

  fetchMore: async (groupId: string) => {
    const cursor = get().cursors[groupId];
    if (!cursor) return;

    try {
      const groupKey = await ensureGroupKey(groupId);
      const { messages, nextCursor } = await chatService.getMessages(groupId, cursor);

      const reversed = [...messages].reverse();
      const decrypted = await decryptMessages(reversed, groupKey);

      set((state) => ({
        messagesByGroup: {
          ...state.messagesByGroup,
          [groupId]: [...decrypted, ...(state.messagesByGroup[groupId] || [])],
        },
        cursors: { ...state.cursors, [groupId]: nextCursor },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load more messages';
      set({ error: message });
    }
  },

  sendMessage: async (groupId: string, plaintext: string, senderId: string, senderName: string) => {
    const groupKey = await ensureGroupKey(groupId);
    const { encryptedContent, iv } = await encryptMessage(plaintext, groupKey);

    // Optimistic UI: add message immediately
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: DecryptedMessage = {
      id: tempId,
      groupId,
      senderId,
      type: 'TEXT',
      iv,
      content: plaintext,
      createdAt: new Date().toISOString(),
      sender: { id: senderId, displayName: senderName, avatarUrl: null },
      isPending: true,
    };

    set((state) => ({
      messagesByGroup: {
        ...state.messagesByGroup,
        [groupId]: [...(state.messagesByGroup[groupId] || []), optimisticMsg],
      },
    }));

    try {
      const { message } = await chatService.sendMessage(groupId, encryptedContent, iv);
      const decrypted: DecryptedMessage = {
        ...message,
        content: plaintext,
        encryptedContent: undefined,
      } as unknown as DecryptedMessage;

      // Replace optimistic message with real one
      set((state) => ({
        messagesByGroup: {
          ...state.messagesByGroup,
          [groupId]: (state.messagesByGroup[groupId] || []).map((m) =>
            m.id === tempId ? decrypted : m,
          ),
        },
      }));
    } catch {
      // Mark optimistic message as failed
      set((state) => ({
        messagesByGroup: {
          ...state.messagesByGroup,
          [groupId]: (state.messagesByGroup[groupId] || []).filter((m) => m.id !== tempId),
        },
        error: 'Failed to send message',
      }));
    }
  },

  receiveMessage: async (message: MessageData) => {
    const existing = get().messagesByGroup[message.groupId] || [];
    // Skip if we already have this message (from our own send)
    if (existing.some((m) => m.id === message.id)) return;

    try {
      const groupKey = await ensureGroupKey(message.groupId);
      const content = await decryptMessage(message.encryptedContent, message.iv, groupKey);

      const decrypted: DecryptedMessage = {
        ...message,
        content,
        encryptedContent: undefined,
      } as unknown as DecryptedMessage;

      set((state) => ({
        messagesByGroup: {
          ...state.messagesByGroup,
          [message.groupId]: [...(state.messagesByGroup[message.groupId] || []), decrypted],
        },
      }));
    } catch (err: unknown) {
      console.warn('[Chat] Failed to decrypt received message:', err instanceof Error ? err.message : err);
    }
  },

  setTyping: (groupId: string, userId: string, isTyping: boolean) => {
    set((state) => {
      const current = state.typingUsers[groupId] || [];
      const updated = isTyping
        ? [...new Set([...current, userId])]
        : current.filter((id) => id !== userId);
      return { typingUsers: { ...state.typingUsers, [groupId]: updated } };
    });
  },

  markRead: async (groupId: string, messageIds: string[]) => {
    try {
      await chatService.markRead(groupId, messageIds);
    } catch (err: unknown) {
      console.warn('[Chat] Failed to mark messages as read:', err instanceof Error ? err.message : err);
    }
  },

  clearGroup: (groupId: string) => {
    set((state) => {
      const { [groupId]: _, ...rest } = state.messagesByGroup;
      return { messagesByGroup: rest };
    });
  },
}));
