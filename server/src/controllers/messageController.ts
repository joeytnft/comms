import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { NotFoundError, ValidationError, AuthorizationError } from '../utils/errors';
import * as hierarchyService from '../services/groups/hierarchyService';

interface SendMessageBody {
  encryptedContent: string;
  iv: string;
  type?: 'TEXT' | 'IMAGE' | 'ALERT' | 'SYSTEM';
}

interface GroupIdParams {
  groupId: string;
}

interface MessagesQuery {
  cursor?: string;
  limit?: string;
}

interface MarkReadBody {
  messageIds: string[];
}

const MESSAGE_SELECT = {
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
} as const;

export async function sendMessage(
  request: FastifyRequest<{ Params: GroupIdParams; Body: SendMessageBody }>,
  reply: FastifyReply,
) {
  const { groupId } = request.params;
  const { encryptedContent, iv, type } = request.body;

  if (!encryptedContent || !iv) {
    throw new ValidationError('encryptedContent and iv are required');
  }

  // Verify group exists in the user's org
  const group = await prisma.group.findFirst({
    where: { id: groupId, organizationId: request.organizationId },
  });
  if (!group) {
    throw new NotFoundError('Group');
  }

  // Verify user has access to the group
  const hasAccess = await hierarchyService.canUserAccessGroup(request.userId, groupId);
  if (!hasAccess) {
    throw new AuthorizationError('You do not have access to this group');
  }

  const message = await prisma.message.create({
    data: {
      groupId,
      senderId: request.userId,
      type: type || 'TEXT',
      encryptedContent,
      iv,
    },
    select: MESSAGE_SELECT,
  });

  reply.status(201).send({ message });

  return message;
}

export async function getMessages(
  request: FastifyRequest<{ Params: GroupIdParams; Querystring: MessagesQuery }>,
  reply: FastifyReply,
) {
  const { groupId } = request.params;
  const { cursor, limit: limitStr } = request.query;
  const limit = Math.min(parseInt(limitStr || '50', 10), 100);

  // Verify group exists in the user's org
  const group = await prisma.group.findFirst({
    where: { id: groupId, organizationId: request.organizationId },
  });
  if (!group) {
    throw new NotFoundError('Group');
  }

  const hasAccess = await hierarchyService.canUserAccessGroup(request.userId, groupId);
  if (!hasAccess) {
    throw new AuthorizationError('You do not have access to this group');
  }

  const messages = await prisma.message.findMany({
    where: { groupId },
    select: {
      ...MESSAGE_SELECT,
      readReceipts: {
        where: { userId: request.userId },
        select: { readAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // Fetch one extra to check for next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = messages.length > limit;
  const items = hasMore ? messages.slice(0, limit) : messages;

  const formatted = items.map((msg) => ({
    ...msg,
    isRead: msg.readReceipts.length > 0,
    readReceipts: undefined,
  }));

  reply.send({
    messages: formatted,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}

export async function markRead(
  request: FastifyRequest<{ Params: GroupIdParams; Body: MarkReadBody }>,
  reply: FastifyReply,
) {
  const { groupId } = request.params;
  const { messageIds } = request.body;

  if (!messageIds || messageIds.length === 0) {
    throw new ValidationError('messageIds array is required');
  }

  // Verify access
  const hasAccess = await hierarchyService.canUserAccessGroup(request.userId, groupId);
  if (!hasAccess) {
    throw new AuthorizationError('You do not have access to this group');
  }

  // Create read receipts (skip duplicates via upsert-like logic)
  const receipts = await Promise.all(
    messageIds.map((messageId) =>
      prisma.readReceipt.upsert({
        where: {
          messageId_userId: {
            messageId,
            userId: request.userId,
          },
        },
        create: {
          messageId,
          userId: request.userId,
        },
        update: {},
      }),
    ),
  );

  reply.send({ readCount: receipts.length });

  return { userId: request.userId, messageIds };
}
