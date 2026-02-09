export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageType = 'text' | 'image' | 'alert' | 'system';

export interface Message {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  encryptedContent: string; // E2E encrypted payload
  iv: string; // Initialization vector for decryption
  status: MessageStatus;
  createdAt: string;
  readBy?: string[]; // User IDs who have read
}

export interface DecryptedMessage extends Omit<Message, 'encryptedContent' | 'iv'> {
  content: string; // Decrypted plaintext
  imageUrl?: string; // For image messages
}

export interface SendMessageData {
  groupId: string;
  content: string;
  type: MessageType;
}

export interface ChatRoom {
  groupId: string;
  groupName: string;
  groupType: 'lead' | 'sub';
  lastMessage?: DecryptedMessage;
  unreadCount: number;
  iconColor?: string;
}
