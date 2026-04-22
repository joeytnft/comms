import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../config/database';
import { generateLiveKitToken, getRoomName } from '../config/livekit';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AuthorizationError, ValidationError } from '../utils/errors';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  return _supabase;
}

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

/**
 * POST /ptt/:groupId/register-token
 * Body: { token: string }
 *
 * Stores (or replaces) the ephemeral APNs PTT push token for this user + group.
 * Called by the iOS app after PTChannelManager fires receivedEphemeralPushToken.
 */
export async function registerPushToken(
  request: FastifyRequest<{ Params: TokenParams; Body: { token: string } }>,
  reply: FastifyReply,
) {
  const { groupId } = request.params;
  const { userId }  = request;
  const { token }   = request.body ?? {};

  if (!token || typeof token !== 'string') {
    throw new ValidationError('token is required');
  }

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) {
    throw new AuthorizationError('You are not a member of this group');
  }

  await prisma.pttPushToken.upsert({
    where:  { userId_groupId: { userId, groupId } },
    create: { userId, groupId, token },
    update: { token },
  });

  reply.status(204).send();
}

/**
 * POST /ptt/:groupId/audio
 * Multipart upload of a client-recorded PTT transmission.
 * Returns { audioUrl } pointing to the Supabase public URL.
 */
export async function uploadAudio(
  request: FastifyRequest<{ Params: TokenParams }>,
  reply: FastifyReply,
) {
  const { groupId } = request.params;
  const { userId } = request;

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) throw new AuthorizationError('You are not a member of this group');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const part = await (request as any).file();
  if (!part) throw new ValidationError('No audio file provided');

  const chunks: Buffer[] = [];
  for await (const chunk of part.file) {
    chunks.push(chunk as Buffer);
  }
  const audioBuffer = Buffer.concat(chunks);

  const rawExt = (part.filename as string | undefined)?.split('.').pop();
  const ext = rawExt && rawExt.length <= 4 ? rawExt : 'm4a';
  const filename = `${groupId}/${userId}_${Date.now()}.${ext}`;

  const { error: uploadErr } = await getSupabase()
    .storage
    .from(env.SUPABASE_PTT_BUCKET)
    .upload(filename, audioBuffer, { contentType: part.mimetype ?? 'audio/mp4', upsert: false });

  if (uploadErr) {
    logger.warn({ err: uploadErr }, '[PTT] Client audio upload failed');
    return reply.status(500).send({ error: 'Upload failed' });
  }

  const { data: { publicUrl } } = getSupabase()
    .storage
    .from(env.SUPABASE_PTT_BUCKET)
    .getPublicUrl(filename);

  logger.info(`[PTT] Client audio uploaded: ${filename}`);
  reply.send({ audioUrl: publicUrl });
}
