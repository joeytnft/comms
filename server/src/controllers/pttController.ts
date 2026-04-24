import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { generateLiveKitToken, getRoomName } from '../config/livekit';
import { getIO } from '../config/socketIO';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AuthorizationError, ValidationError } from '../utils/errors';
import { startTransmissionEgress, stopTransmissionEgress } from '../services/ptt/livekitService';
import { notifyTransmissionStarted, notifyTransmissionStopped } from '../services/apns/pttPushService';

const SESSION_TTL = 7200;

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

/**
 * POST /ptt/:groupId/start
 * HTTP alternative to the ptt:start socket event for iOS native PTT.
 * The iOS audio session activation drops the WebSocket; HTTP uses a fresh
 * TCP connection so it reaches the server reliably regardless of socket state.
 */
export async function transmitStart(
  request: FastifyRequest<{ Params: TokenParams; Body: { mimeType?: string } }>,
  reply: FastifyReply,
) {
  const { groupId } = request.params;
  const { userId } = request;

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
    include: { user: { select: { displayName: true } } },
  });
  if (!membership) throw new AuthorizationError('Not a member of this group');

  const room = `ptt:${groupId}`;
  const displayName = membership.user.displayName;
  const startedAt = new Date().toISOString();

  logger.info(`[PTT] HTTP ptt:start from ${userId} in ${room}`);

  const io = getIO();
  io?.to(room).emit('ptt:speaking', { groupId, userId, displayName, startedAt });

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { parentGroupId: true },
  });
  if (group?.parentGroupId) {
    io?.to(`ptt:${group.parentGroupId}`).emit('ptt:speaking', {
      groupId, userId, displayName, startedAt, fromSubGroup: true,
    });
  }

  // APNs wake-up for offline members
  try {
    const socketsInRoom = await (io?.in(room).fetchSockets() ?? Promise.resolve([]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onlineIds = new Set(socketsInRoom.map((s) => (s as any).user?.userId as string | undefined).filter((id): id is string => typeof id === 'string'));
    const pushTokens = await prisma.pttPushToken.findMany({
      where: { groupId, NOT: { userId: { in: [...onlineIds] } } },
      select: { token: true },
    });
    if (pushTokens.length > 0) {
      notifyTransmissionStarted(
        pushTokens.map((t) => t.token),
        groupId, userId, displayName,
      ).catch((err) => logger.error({ err }, '[PTT] APNs notify start failed'));
    }
  } catch (err) {
    logger.warn({ err }, '[PTT] Failed to send APNs notifications for HTTP ptt:start');
  }

  // Redis session (used for web audio-chunk reassembly)
  const mimeType = request.body?.mimeType ?? 'audio/mp4';
  const pipeline = redis.pipeline();
  pipeline.hset(`ptt:session:${userId}:${groupId}`, { startedAt: Date.now(), mimeType });
  pipeline.expire(`ptt:session:${userId}:${groupId}`, SESSION_TTL);
  pipeline.del(`ptt:chunks:${userId}:${groupId}`);
  await pipeline.exec();

  startTransmissionEgress(groupId, userId).catch(
    (err) => logger.warn({ err }, '[PTT] HTTP ptt:start: egress start failed'),
  );

  reply.status(204).send();
}

/**
 * POST /ptt/:groupId/stop
 * HTTP alternative to the ptt:stop socket event.
 */
export async function transmitStop(
  request: FastifyRequest<{ Params: TokenParams }>,
  reply: FastifyReply,
) {
  const { groupId } = request.params;
  const { userId } = request;

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) throw new AuthorizationError('Not a member of this group');

  const room = `ptt:${groupId}`;
  const endedAt = new Date().toISOString();

  logger.info(`[PTT] HTTP ptt:stop from ${userId} in ${room}`);

  const io = getIO();
  io?.to(room).emit('ptt:stopped', { groupId, userId, endedAt });

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { parentGroupId: true },
  });
  if (group?.parentGroupId) {
    io?.to(`ptt:${group.parentGroupId}`).emit('ptt:stopped', {
      groupId, userId, endedAt, fromSubGroup: true,
    });
  }

  // APNs stop notifications
  try {
    const pushTokens = await prisma.pttPushToken.findMany({
      where: { groupId },
      select: { token: true },
    });
    if (pushTokens.length > 0) {
      notifyTransmissionStopped(
        pushTokens.map((t) => t.token), groupId,
      ).catch((err) => logger.error({ err }, '[PTT] APNs notify stop failed'));
    }
  } catch (err) {
    logger.warn({ err }, '[PTT] Failed to send APNs notifications for HTTP ptt:stop');
  }

  stopTransmissionEgress(userId, groupId).catch(
    (err) => logger.warn({ err }, '[PTT] HTTP ptt:stop: egress stop failed'),
  );

  reply.status(204).send();
}

/**
 * POST /ptt/:groupId/native-log
 * Body: { durationMs: number; audioUrl?: string }
 * HTTP alternative to the ptt:native_log socket event.
 */
export async function nativeLog(
  request: FastifyRequest<{ Params: TokenParams; Body: { durationMs: number; audioUrl?: string } }>,
  reply: FastifyReply,
) {
  const { groupId } = request.params;
  const { userId } = request;
  const { durationMs = 0, audioUrl } = request.body ?? {};

  const [user, savedLog] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
    prisma.pttLog.create({
      data: {
        groupId,
        senderId: userId,
        durationMs,
        ...(audioUrl ? { audioUrl } : {}),
      },
    }),
  ]);

  const room = `ptt:${groupId}`;
  getIO()?.to(room).emit('ptt:log_saved', {
    id: savedLog.id,
    groupId,
    userId,
    displayName: user?.displayName ?? 'Unknown',
    audioUrl,
    durationMs,
    createdAt: savedLog.createdAt.toISOString(),
  });

  logger.info(`[PTT] HTTP native-log saved: ${savedLog.id} (${durationMs}ms) for ${userId}`);
  reply.status(204).send();
}
