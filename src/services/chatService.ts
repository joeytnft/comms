import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';

export interface MessageData {
  id: string;
  groupId: string;
  senderId: string;
  type: 'TEXT' | 'IMAGE' | 'ALERT' | 'SYSTEM';
  encryptedContent: string;
  iv: string;
  createdAt: string;
  sender: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  isRead?: boolean;
}

interface MessagesResponse {
  messages: MessageData[];
  nextCursor: string | null;
}

interface SendMessageResponse {
  message: MessageData;
}

interface MarkReadResponse {
  readCount: number;
}

export const chatService = {
  async getMessages(groupId: string, cursor?: string, limit = 50): Promise<MessagesResponse> {
    const params: Record<string, string> = { limit: String(limit) };
    if (cursor) params.cursor = cursor;
    return apiClient.get<MessagesResponse>(ENDPOINTS.MESSAGES.LIST(groupId), params);
  },

  async sendMessage(
    groupId: string,
    encryptedContent: string,
    iv: string,
    type: 'TEXT' | 'IMAGE' = 'TEXT',
  ): Promise<SendMessageResponse> {
    return apiClient.post<SendMessageResponse>(ENDPOINTS.MESSAGES.SEND(groupId), {
      encryptedContent,
      iv,
      type,
    });
  },

  async markRead(groupId: string, messageIds: string[]): Promise<MarkReadResponse> {
    return apiClient.post<MarkReadResponse>(ENDPOINTS.MESSAGES.MARK_READ(groupId), {
      messageIds,
    });
  },
};
