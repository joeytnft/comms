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

// Signed URL TTL for PTT recordings. Mobile clients re-fetch the log (and
// thus refresh URLs) on demand, so a relatively short window is fine.
const PTT_AUDIO_SIGNED_URL_SECONDS = 60 * 60 * 6; // 6h

// Allow-listed PTT upload mime types. Trusting the client's mimetype lets a
// caller serve text/html through the bucket — which becomes stored XSS if
// recipients open the URL in a browser context.
const ALLOWED_PTT_MIME_TYPES = new Set([
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
]);

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  return _supabase;
}

async function getSignedAudioUrl(filename: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .storage
    .from(env.SUPABASE_PTT_BUCKET)
    .createSignedUrl(filename, PTT_AUDIO_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    logger.warn({ err: error, filename }, '[PTT] Failed to create signed audio URL');
    return null;
  }
  return data.signedUrl;
}

/**
 * Authorize a request against a group. Confirms (a) the caller is a member,
 * (b) the group exists in the caller's org. Without (b) a stale cross-org
 * membership row would let the caller act on another tenant's group.
 *
 * Use this helper everywhere a PTT endpoint reads a `groupId` from the URL.
 */
async function assertGroupAccess(
  groupId: string,
  userId: string,
  organizationId: string,
) {
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
    include: {
      user: { select: { displayName: true } },
      group: { select: { name: true, organizationId: true, type: true, parentGroupId: true } },
    },
  });
  if (!membership) {
    throw new AuthorizationError('You are not a member of this group');
  }
  if (membership.group.organizationId !== organizationId) {
    throw new AuthorizationError('Group does not belong to your organization');
  }
  return membership;
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
  const membership = await assertGroupAccess(groupId, userId, request.organizationId);

  const token = await generateLiveKitToken(userId, membership.user.displayName, groupId);

  // Lead group members receive listen-only tokens for every sub-group so they
  // can hear sub-group transmissions without being able to publish into those rooms.
  let subGroupRooms: Array<{ groupId: string; groupName: string; token: string; roomName: string }> | undefined;
  if (membership.group.type === 'LEAD') {
    const subGroups = await prisma.group.findMany({
      where: { parentGroupId: groupId },
      select: { id: true, name: true },
    });
    if (subGroups.length > 0) {
      subGroupRooms = await Promise.all(
        subGroups.map(async (sg) => ({
          groupId: sg.id,
          groupName: sg.name,
          token: await generateLiveKitToken(userId, membership.user.displayName, sg.id, false),
          roomName: getRoomName(sg.id),
        })),
      );
    }
  }

  reply.send({
    token,
    roomName: getRoomName(groupId),
    livekitUrl: env.LIVEKIT_URL,
    groupName: membership.group.name,
    ...(subGroupRooms ? { subGroupRooms } : {}),
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
  await assertGroupAccess(groupId, userId, request.organizationId);

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
  // Cap length so we never store a 1MB blob if the client misbehaves.
  if (token.length > 256) {
    throw new ValidationError('token is too long');
  }

  await assertGroupAccess(groupId, userId, request.organizationId);

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
  await assertGroupAccess(groupId, userId, request.organizationId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const part = await (request as any).file();
  if (!part) throw new ValidationError('No audio file provided');

  // Server-side validation of mimetype. The previous code used the client's
  // declared mimetype straight through to Supabase; a malicious uploader
  // could set `text/html` and turn the public bucket into a stored-XSS sink.
  const declaredMime = (part.mimetype ?? '').toString().toLowerCase().trim();
  if (!ALLOWED_PTT_MIME_TYPES.has(declaredMime)) {
    throw new ValidationError('Unsupported audio mimetype');
  }

  // Sanitise extension: strip path components and only allow a small allowlist.
  const ALLOWED_EXTS = new Set(['m4a', 'mp4', 'aac', 'wav', 'webm', 'ogg']);
  const rawExt = (part.filename as string | undefined)?.split('.').pop()?.toLowerCase() ?? 'm4a';
  const ext = ALLOWED_EXTS.has(rawExt) ? rawExt : 'm4a';

  const chunks: Buffer[] = [];
  for await (const chunk of part.file) {
    chunks.push(chunk as Buffer);
  }
  const audioBuffer = Buffer.concat(chunks);
  // Reject empty / oversized payloads at the controller boundary.
  if (audioBuffer.length === 0) throw new ValidationError('Audio file is empty');
  if (audioBuffer.length > 25 * 1024 * 1024) {
    throw new ValidationError('Audio file is too large');
  }

  const filename = `${groupId}/${userId}_${Date.now()}.${ext}`;

  const { error: uploadErr } = await getSupabase()
    .storage
    .from(env.SUPABASE_PTT_BUCKET)
    .upload(filename, audioBuffer, { contentType: declaredMime, upsert: false });

  if (uploadErr) {
    logger.warn({ err: uploadErr }, '[PTT] Client audio upload failed');
    return reply.status(500).send({ error: 'Upload failed' });
  }

  // Signed URL with TTL — bucket is configured private. Removed members and
  // the public internet cannot guess and replay the URL forever.
  const audioUrl = await getSignedAudioUrl(filename);
  if (!audioUrl) {
    return reply.status(500).send({ error: 'Could not generate signed URL' });
  }

  logger.info(`[PTT] Client audio uploaded: ${filename}`);
  reply.send({ audioUrl });
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
  const membership = await assertGroupAccess(groupId, userId, request.organizationId);

  const room = `ptt:${groupId}`;
  const displayName = membership.user.displayName;
  const startedAt = new Date().toISOString();

  logger.info(`[PTT] HTTP ptt:start from ${userId} in ${room}`);

  const io = getIO();

  // Fetch sockets once — reused for both the broadcast exclusion and APNs logic.
  const socketsInRoom = await (io?.in(room).fetchSockets() ?? Promise.resolve([]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transmitterSocketIds = socketsInRoom.filter((s) => (s as any).user?.userId === userId).map((s) => s.id);

  // Broadcast to everyone in the room EXCEPT the transmitter.
  // Using io.to(room) (all sockets) would echo ptt:speaking back to the sender,
  // which sets their pttState to 'receiving' and shows themselves as the active speaker.
  if (io) {
    const target = transmitterSocketIds.length > 0 ? io.to(room).except(transmitterSocketIds) : io.to(room);
    target.emit('ptt:speaking', { groupId, userId, displayName, startedAt });
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { parentGroupId: true },
  });
  if (group?.parentGroupId && io) {
    const parentRoom = `ptt:${group.parentGroupId}`;
    const target = transmitterSocketIds.length > 0 ? io.to(parentRoom).except(transmitterSocketIds) : io.to(parentRoom);
    target.emit('ptt:speaking', { groupId, userId, displayName, startedAt, fromSubGroup: true });
  }

  // APNs wake-up for offline members
  try {
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
  await assertGroupAccess(groupId, userId, request.organizationId);

  const room = `ptt:${groupId}`;
  const endedAt = new Date().toISOString();

  logger.info(`[PTT] HTTP ptt:stop from ${userId} in ${room}`);

  const io = getIO();
  const socketsInRoomStop = await (io?.in(room).fetchSockets() ?? Promise.resolve([]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stopperSocketIds = socketsInRoomStop.filter((s) => (s as any).user?.userId === userId).map((s) => s.id);

  if (io) {
    const target = stopperSocketIds.length > 0 ? io.to(room).except(stopperSocketIds) : io.to(room);
    target.emit('ptt:stopped', { groupId, userId, endedAt });
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { parentGroupId: true },
  });
  if (group?.parentGroupId && io) {
    const parentRoom = `ptt:${group.parentGroupId}`;
    const target = stopperSocketIds.length > 0 ? io.to(parentRoom).except(stopperSocketIds) : io.to(parentRoom);
    target.emit('ptt:stopped', { groupId, userId, endedAt, fromSubGroup: true });
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

  // Authorize first — previously this endpoint had no check at all, so any
  // authenticated user could write a pttLog row in any group.
  const membership = await assertGroupAccess(groupId, userId, request.organizationId);

  // Sanity-check duration (prevent negative or absurd values polluting the audit log).
  const safeDurationMs = Number.isFinite(durationMs) && durationMs >= 0 && durationMs < 60 * 60 * 1000
    ? Math.floor(durationMs)
    : 0;

  // If the client supplied an audioUrl, only accept Supabase-hosted URLs we
  // could plausibly have signed ourselves; never persist arbitrary attacker URLs.
  let safeAudioUrl: string | undefined;
  if (audioUrl) {
    try {
      const u = new URL(audioUrl);
      const supabaseHost = new URL(env.SUPABASE_URL).hostname;
      if (u.protocol === 'https:' && u.hostname === supabaseHost) {
        safeAudioUrl = audioUrl;
      }
    } catch {
      // Invalid URL — drop silently.
    }
  }

  const savedLog = await prisma.pttLog.create({
    data: {
      groupId,
      senderId: userId,
      durationMs: safeDurationMs,
      ...(safeAudioUrl ? { audioUrl: safeAudioUrl } : {}),
    },
  });

  const room = `ptt:${groupId}`;
  getIO()?.to(room).emit('ptt:log_saved', {
    id: savedLog.id,
    groupId,
    userId,
    displayName: membership.user.displayName,
    audioUrl: safeAudioUrl,
    durationMs: safeDurationMs,
    createdAt: savedLog.createdAt.toISOString(),
  });

  logger.info(`[PTT] HTTP native-log saved: ${savedLog.id} (${safeDurationMs}ms) for ${userId}`);
  reply.status(204).send();
}
