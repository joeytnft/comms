import { Server, Socket } from 'socket.io';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import * as hierarchyService from '../services/groups/hierarchyService';

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

export function setupChatSocket(io: Server, socket: Socket) {
  const { userId } = socket.user;

  // Join a group's real-time channel
  socket.on('join_group', async (data: JoinGroupData) => {
    try {
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
    socket.leave(`group:${data.groupId}`);
    logger.info(`[Chat] User ${userId} left group ${data.groupId}`);
  });

  // Send a message via socket (alternative to REST endpoint)
  socket.on('send_message', async (data: NewMessageData, callback?: (response: unknown) => void) => {
    try {
      if (!data.encryptedContent || !data.iv || !data.groupId) {
        socket.emit('error', { message: 'Missing required fields' });
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
        select: { parentGroupId: true, type: true },
      });

      if (group?.parentGroupId) {
        io.to(`group:${group.parentGroupId}`).emit('new_message', {
          ...message,
          fromSubGroup: data.groupId,
        });
      }

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
    socket.to(`group:${data.groupId}`).emit('user_typing', {
      userId,
      groupId: data.groupId,
      isTyping: data.isTyping,
    });
  });

  // Read receipts via socket
  socket.on('mark_read', async (data: ReadReceiptData) => {
    try {
      if (!data.messageIds || data.messageIds.length === 0) return;

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
