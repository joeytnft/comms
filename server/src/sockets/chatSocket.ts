import { Server, Socket } from 'socket.io';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import * as hierarchyService from '../services/groups/hierarchyService';
import { sendChatMessagePushNotifications } from '../services/notifications/pushService';

interface JoinGroupData {
  groupId: string;
}

interface NewMessageData {
  groupId: string;
  encryptedContent: string;
  iv: string;
  type?: 'TEXT' | 'IMAGE' | 'ALERT' | 'SYSTEM';
}

interface TypingData {
  groupId: string;
  isTyping: boolean;
}

interface ReadReceiptData {
  groupId: string;
  messageIds: string[];
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0;
}

function isValidGroupId(val: unknown): val is string {
  return isNonEmptyString(val) && val.length <= 64;
}

const MAX_ENCRYPTED_CONTENT_LENGTH = 65536; // 64KB max for encrypted message content

export function setupChatSocket(io: Server, socket: Socket) {
  const { userId } = socket.user;

  // Join a group's real-time channel
  socket.on('join_group', async (data: JoinGroupData) => {
    try {
      if (!data || !isValidGroupId(data.groupId)) {
        socket.emit('error', { message: 'Invalid groupId' });
        return;
      }
      const hasAccess = await hierarchyService.canUserAccessGroup(userId, data.groupId);
      if (!hasAccess) {
        socket.emit('error', { message: 'No access to this group' });
        return;
      }
      socket.join(`group:${data.groupId}`);
      logger.info(`[Chat] User ${userId} joined group ${data.groupId}`);
    } catch (error) {
      logger.error({ err: error }, '[Chat] Error joining group');
      socket.emit('error', { message: 'Failed to join group' });
    }
  });

  // Leave a group's real-time channel
  socket.on('leave_group', (data: JoinGroupData) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    socket.leave(`group:${data.groupId}`);
    logger.info(`[Chat] User ${userId} left group ${data.groupId}`);
  });

  // Send a message via socket (alternative to REST endpoint)
  socket.on('send_message', async (data: NewMessageData, callback?: (response: unknown) => void) => {
    try {
      if (
        !data ||
        !isValidGroupId(data.groupId) ||
        !isNonEmptyString(data.encryptedContent) ||
        !isNonEmptyString(data.iv) ||
        data.encryptedContent.length > MAX_ENCRYPTED_CONTENT_LENGTH
      ) {
        socket.emit('error', { message: 'Missing or invalid required fields' });
        return;
      }

      if (data.type && !['TEXT', 'IMAGE', 'ALERT', 'SYSTEM'].includes(data.type)) {
        socket.emit('error', { message: 'Invalid message type' });
        return;
      }

      // Verify access
      const hasAccess = await hierarchyService.canUserAccessGroup(userId, data.groupId);
      if (!hasAccess) {
        socket.emit('error', { message: 'No access to this group' });
        return;
      }

      // Persist the message
      const message = await prisma.message.create({
        data: {
          groupId: data.groupId,
          senderId: userId,
          type: data.type || 'TEXT',
          encryptedContent: data.encryptedContent,
          iv: data.iv,
        },
        select: {
          id: true,
          groupId: true,
          senderId: true,
          type: true,
          encryptedContent: true,
          iv: true,
          createdAt: true,
          sender: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      });

      // Broadcast to group members (including sender for confirmation)
      io.to(`group:${data.groupId}`).emit('new_message', message);

      // Also notify LEAD group members if this is a SUB group
      const group = await prisma.group.findUnique({
        where: { id: data.groupId },
        select: { name: true, parentGroupId: true, type: true },
      });

      if (group?.parentGroupId) {
        io.to(`group:${group.parentGroupId}`).emit('new_message', {
          ...message,
          fromSubGroup: data.groupId,
        });
      }

      // Push notifications to offline members (fire-and-forget)
      const groupName = group?.name ?? 'GatherSafe';
      sendChatMessagePushNotifications(
        data.groupId,
        userId,
        message.id,
        message.sender?.displayName ?? 'Unknown',
        groupName,
      ).catch((err) => logger.error({ err }, '[Chat] Push notification error'));

      // Acknowledge to sender
      if (callback) {
        callback({ status: 'ok', message });
      }
    } catch (error) {
      logger.error({ err: error }, '[Chat] Error sending message');
      socket.emit('error', { message: 'Failed to send message' });
      if (callback) {
        callback({ status: 'error', message: 'Failed to send message' });
      }
    }
  });

  // Typing indicator
  socket.on('typing', (data: TypingData) => {
    if (!data || !isValidGroupId(data.groupId) || typeof data.isTyping !== 'boolean') return;
    socket.to(`group:${data.groupId}`).emit('user_typing', {
      userId,
      groupId: data.groupId,
      isTyping: data.isTyping,
    });
  });

  // Read receipts via socket
  socket.on('mark_read', async (data: ReadReceiptData) => {
    try {
      if (!data || !isValidGroupId(data.groupId)) return;
      if (!Array.isArray(data.messageIds) || data.messageIds.length === 0 || data.messageIds.length > 100) return;
      if (!data.messageIds.every((id) => isNonEmptyString(id))) return;

      await Promise.all(
        data.messageIds.map((messageId) =>
          prisma.readReceipt.upsert({
            where: { messageId_userId: { messageId, userId } },
            create: { messageId, userId },
            update: {},
          }),
        ),
      );

      // Notify group that messages were read
      socket.to(`group:${data.groupId}`).emit('messages_read', {
        userId,
        messageIds: data.messageIds,
      });
    } catch (error) {
      logger.error({ err: error }, '[Chat] Error marking messages read');
    }
  });
}
