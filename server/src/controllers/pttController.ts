import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../config/database';
import { generateLiveKitToken, getRoomName } from '../config/livekit';
import { getIO } from '../config/socketIO';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AuthorizationError, ValidationError } from '../utils/errors';
import {
  beginTransmission,
  endTransmission,
} from '../services/ptt/transmissionService';

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

  // Sub-group members get a listen-only token for their parent lead group so
  // the client can pre-connect at join time (autoSubscribe:false). This allows
  // near-instant audio on the first "Broadcast to All" transmission without the
  // 300-500 ms token-fetch + room-connect latency of the on-demand approach.
  let leadRoom: {
    groupId: string; groupName: string; token: string; roomName: string; livekitUrl: string;
  } | undefined;
  if (membership.group.parentGroupId) {
    const leadGroup = await prisma.group.findUnique({
      where:  { id: membership.group.parentGroupId },
      select: { id: true, name: true, type: true },
    });
    if (leadGroup?.type === 'LEAD') {
      leadRoom = {
        groupId:    leadGroup.id,
        groupName:  leadGroup.name,
        token:      await generateLiveKitToken(userId, membership.user.displayName, leadGroup.id, false),
        roomName:   getRoomName(leadGroup.id),
        livekitUrl: env.LIVEKIT_URL ?? '',
      };
    }
  }

  reply.send({
    token,
    roomName: getRoomName(groupId),
    livekitUrl: env.LIVEKIT_URL,
    groupName: membership.group.name,
    ...(subGroupRooms ? { subGroupRooms } : {}),
    ...(leadRoom      ? { leadRoom }      : {}),
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

// Compute the set of socket IDs owned by `userId` in `room`. The HTTP path
// excludes ALL of the user's sockets from the broadcast (the user's other
// devices already know they pressed the button); the socket path only
// excludes the originating socket. transmissionService takes whatever the
// caller passes here, so this helper keeps the HTTP semantic in one place.
async function getUserSocketIdsInRoom(roomName: string, userId: string): Promise<string[]> {
  const io = getIO();
  if (!io) return [];
  const socketsInRoom = await io.in(roomName).fetchSockets();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return socketsInRoom.filter((s) => (s as any).user?.userId === userId).map((s) => s.id);
}

/**
 * GET /ptt/:groupId/lead-room-token
 * Returns a listen-only LiveKit token for the lead group room.
 * Called by sub-group members when the lead admin starts a "Broadcast to All"
 * transmission so they can connect to the lead room and hear the audio.
 *
 * Authorization: the caller must be a member of a sub-group whose parent is :groupId.
 */
export async function getLeadRoomToken(
  request: FastifyRequest<{ Params: TokenParams }>,
  reply: FastifyReply,
) {
  const { groupId } = request.params; // this is the LEAD group's id
  const { userId } = request;

  // Verify the caller belongs to at least one sub-group of this lead group
  // and that the lead group is in the same org.
  const leadGroup = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, type: true, organizationId: true },
  });
  if (!leadGroup || leadGroup.organizationId !== request.organizationId) {
    throw new AuthorizationError('Group not found');
  }
  if (leadGroup.type !== 'LEAD') {
    throw new AuthorizationError('Not a lead group');
  }

  const subMembership = await prisma.groupMembership.findFirst({
    where: {
      userId,
      group: { parentGroupId: groupId },
    },
    include: { user: { select: { displayName: true } } },
  });
  if (!subMembership) {
    throw new AuthorizationError('Not a member of a sub-group of this channel');
  }

  const token = await generateLiveKitToken(
    userId, subMembership.user.displayName, groupId, /* canPublish */ false,
  );

  reply.send({
    token,
    roomName: getRoomName(groupId),
    livekitUrl: env.LIVEKIT_URL,
    groupName: leadGroup.name,
  });
}

/**
 * POST /ptt/:groupId/start
 * HTTP alternative to the ptt:start socket event for iOS native PTT.
 * The iOS audio session activation drops the WebSocket; HTTP uses a fresh
 * TCP connection so it reaches the server reliably regardless of socket state.
 *
 * Body: { mimeType?: string; broadcastToAll?: boolean }
 * broadcastToAll is only honoured for LEAD group members and causes ptt:speaking
 * to be forwarded to all sub-group socket rooms so sub-group members can join
 * the lead room for audio.
 */
export async function transmitStart(
  request: FastifyRequest<{ Params: TokenParams; Body: { mimeType?: string; broadcastToAll?: boolean } }>,
  reply: FastifyReply,
) {
  const { groupId } = request.params;
  const { userId } = request;
  const membership = await assertGroupAccess(groupId, userId, request.organizationId);

  logger.info(`[PTT] HTTP ptt:start from ${userId} in ptt:${groupId}`);

  const excludeSocketIds = await getUserSocketIdsInRoom(`ptt:${groupId}`, userId);
  const broadcastToSubGroups =
    request.body?.broadcastToAll === true && membership.group.type === 'LEAD';

  await beginTransmission(
    { groupId, userId, displayName: membership.user.displayName },
    { mimeType: request.body?.mimeType ?? 'audio/mp4', excludeSocketIds, broadcastToSubGroups },
  );

  reply.status(204).send();
}

/**
 * POST /ptt/:groupId/stop
 * HTTP alternative to the ptt:stop socket event.
 *
 * Body: { broadcastToAll?: boolean }
 * Must match the broadcastToAll flag from the corresponding /start call so
 * the ptt:stopped event reaches the same sub-group socket rooms.
 */
export async function transmitStop(
  request: FastifyRequest<{ Params: TokenParams; Body: { broadcastToAll?: boolean } }>,
  reply: FastifyReply,
) {
  const { groupId } = request.params;
  const { userId } = request;
  const membership = await assertGroupAccess(groupId, userId, request.organizationId);

  logger.info(`[PTT] HTTP ptt:stop from ${userId} in ptt:${groupId}`);

  const excludeSocketIds = await getUserSocketIdsInRoom(`ptt:${groupId}`, userId);
  const broadcastToSubGroups =
    request.body?.broadcastToAll === true && membership.group.type === 'LEAD';

  await endTransmission(
    { groupId, userId, displayName: membership.user.displayName },
    { excludeSocketIds, broadcastToSubGroups },
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
