import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { generateLiveKitToken, getRoomName } from '../config/livekit';
import { env } from '../config/env';
import { AuthorizationError } from '../utils/errors';

interface TokenParams {
  groupId: string;
}

/**
 * GET /ptt/:groupId/token
 * Returns a LiveKit access token for the authenticated user to join the group's PTT room.
 */
export async function getToken(
  request: FastifyRequest<{ Params: TokenParams }>,
  reply: FastifyReply,
) {
  const { groupId } = request.params;
  const { userId } = request;

  // Verify user is a member of the group
  const membership = await prisma.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId, userId },
    },
    include: {
      user: { select: { displayName: true } },
      group: { select: { name: true, organizationId: true } },
    },
  });

  if (!membership) {
    throw new AuthorizationError('You are not a member of this group');
  }

  // Verify group belongs to user's org
  if (membership.group.organizationId !== request.organizationId) {
    throw new AuthorizationError('Group does not belong to your organization');
  }

  const token = await generateLiveKitToken(userId, membership.user.displayName, groupId);

  reply.send({
    token,
    roomName: getRoomName(groupId),
    livekitUrl: env.LIVEKIT_URL,
    groupName: membership.group.name,
  });
}

/**
 * GET /ptt/:groupId/participants
 * Returns current connected members in the PTT room (based on group membership).
 */
export async function getParticipants(
  request: FastifyRequest<{ Params: TokenParams }>,
  reply: FastifyReply,
) {
  const { groupId } = request.params;
  const { userId } = request;

  // Verify membership
  const membership = await prisma.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId, userId },
    },
  });

  if (!membership) {
    throw new AuthorizationError('You are not a member of this group');
  }

  // Get all members of the group
  const members = await prisma.groupMembership.findMany({
    where: { groupId },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true, lastSeenAt: true },
      },
    },
  });

  reply.send({
    participants: members.map((m) => ({
      userId: m.user.id,
      displayName: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
      lastSeenAt: m.user.lastSeenAt,
      role: m.role,
    })),
  });
}
