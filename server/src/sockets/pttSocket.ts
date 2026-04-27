import { Server, Socket } from 'socket.io';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import {
  notifyTransmissionStarted,
  notifyTransmissionStopped,
} from '../services/apns/pttPushService';
import {
  startTransmissionEgress,
  stopTransmissionEgress,
} from '../services/ptt/livekitService';
import { canUserAccessGroup } from '../services/groups/hierarchyService';

const execFileAsync = promisify(execFile);
const SESSION_TTL = 7200; // 2-hour safety net for stale Redis keys

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  return _supabase;
}

// Transcode raw WebM/OGG to M4A using ffmpeg with voice-optimised settings.
async function transcodeToM4A(input: Uint8Array): Promise<Buffer> {
  const tmpIn  = path.join(os.tmpdir(), `ptt_in_${Date.now()}`);
  const tmpOut = path.join(os.tmpdir(), `ptt_out_${Date.now()}.m4a`);
  fs.writeFileSync(tmpIn, input);
  try {
    await execFileAsync('ffmpeg', [
      '-i', tmpIn,
      '-c:a', 'aac',
      '-b:a', '32k',
      '-ar', '16000',
      '-ac', '1',
      '-y', tmpOut,
    ]);
    return fs.readFileSync(tmpOut);
  } finally {
    for (const f of [tmpIn, tmpOut]) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
}

async function savePttLog(
  userId: string,
  groupId: string,
  chunks: Buffer[],
  mimeType: string,
  startedAt: number,
): Promise<{ audioUrl: string | null; durationMs: number; displayName: string } | null> {
  try {
    const durationMs = Date.now() - startedAt;
    let audioUrl: string | null = null;

    try {
      let audioBuffer: Uint8Array = Buffer.concat(chunks);
      let ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
      let finalMime = mimeType;

      try {
        audioBuffer = await transcodeToM4A(audioBuffer);
        ext = 'm4a';
        finalMime = 'audio/mp4';
      } catch {
        // ffmpeg unavailable — keep original format
      }

      const filename = `${groupId}/${userId}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await getSupabase()
        .storage
        .from(env.SUPABASE_PTT_BUCKET)
        .upload(filename, audioBuffer, { contentType: finalMime, upsert: false });

      if (uploadErr) {
        logger.warn({ err: uploadErr }, '[PTT] Audio upload failed — logging call without recording');
      } else {
        // Signed URL with TTL — bucket is private. Removed members and the
        // public internet cannot guess and replay these URLs forever.
        const { data: signed, error: signErr } = await getSupabase()
          .storage
          .from(env.SUPABASE_PTT_BUCKET)
          .createSignedUrl(filename, 60 * 60 * 6);
        if (signErr || !signed?.signedUrl) {
          logger.warn({ err: signErr, filename }, '[PTT] Failed to create signed URL after upload');
        } else {
          audioUrl = signed.signedUrl;
        }
      }
    } catch (uploadErr) {
      logger.warn({ err: uploadErr }, '[PTT] Audio upload failed — logging call without recording');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    await prisma.pttLog.create({
      data: { groupId, senderId: userId, durationMs, ...(audioUrl ? { audioUrl } : {}) },
    });

    logger.info(`[PTT] Voice log saved (${durationMs}ms)${audioUrl ? '' : ' [no audio]'}`);
    return { audioUrl, durationMs, displayName: user?.displayName ?? 'Unknown' };
  } catch (err) {
    logger.error({ err }, '[PTT] Failed to save voice log');
    return null;
  }
}

function isValidGroupId(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0 && val.length <= 64;
}

export function setupPTTSocket(io: Server, socket: Socket) {
  const { userId, organizationId } = socket.user as { userId: string; organizationId: string };

  // Single helper used by every event below — confirms the caller is in this
  // group (directly or via parent LEAD membership) AND that the group is in
  // their org. Without the org cross-check a stale cross-tenant membership
  // row would let the caller eavesdrop on another church's PTT room.
  async function authorizeGroupOrFail(
    groupId: string,
    eventName: string,
  ): Promise<{ displayName: string } | null> {
    const allowed = await canUserAccessGroup(userId, groupId, organizationId);
    if (!allowed) {
      logger.warn({ userId, groupId, organizationId, eventName }, '[PTT] socket access denied');
      socket.emit('ptt:error', { message: 'Not a member of this group' });
      return null;
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    return { displayName: user?.displayName ?? 'Unknown' };
  }

  socket.on('ptt:join', async (data: { groupId: string }) => {
    if (!data || !isValidGroupId(data.groupId)) {
      socket.emit('ptt:error', { message: 'Invalid groupId' });
      return;
    }
    const { groupId } = data;
    const ctx = await authorizeGroupOrFail(groupId, 'ptt:join');
    if (!ctx) return;

    const room = `ptt:${groupId}`;
    socket.join(room);

    socket.to(room).emit('ptt:member_joined', {
      userId,
      displayName: ctx.displayName,
      groupId,
    });

    const socketsInRoom = await io.in(room).fetchSockets();
    const memberIds = socketsInRoom
      .map((s) => (s as unknown as Socket).user?.userId)
      .filter(Boolean);

    socket.emit('ptt:room_state', {
      groupId,
      connectedMembers: memberIds.length,
      memberIds,
    });

    logger.info(`[PTT] ${userId} joined PTT room ${room}`);
  });

  socket.on('ptt:leave', async (data: { groupId: string }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    const { groupId } = data;
    const room = `ptt:${groupId}`;
    socket.leave(room);
    socket.to(room).emit('ptt:member_left', { userId, groupId });
    logger.info(`[PTT] ${userId} left PTT room ${room}`);
  });

  socket.on('ptt:start', async (data: { groupId: string; mimeType?: string }) => {
    if (!data || !isValidGroupId(data.groupId)) {
      logger.warn({ userId, data }, '[PTT] ptt:start rejected — invalid payload');
      return;
    }
    const { groupId } = data;
    const ctx = await authorizeGroupOrFail(groupId, 'ptt:start');
    if (!ctx) return;
    const room = `ptt:${groupId}`;
    const mimeType = data.mimeType || 'audio/webm';
    // Always log at info so we can tell from Railway whether the event reached
    // the server when debugging egress start failures.
    logger.info(`[PTT] ptt:start received from ${userId} for ${room}`);

    // Persist session metadata + clear any stale chunks from a prior session.
    // Both keys are given a 2-hour TTL so Redis self-cleans if ptt:stop never fires.
    const sessionKey = `ptt:session:${userId}:${groupId}`;
    const chunksKey  = `ptt:chunks:${userId}:${groupId}`;
    const pipeline = redis.pipeline();
    pipeline.hset(sessionKey, { startedAt: Date.now(), mimeType });
    pipeline.expire(sessionKey, SESSION_TTL);
    pipeline.del(chunksKey);
    await pipeline.exec();

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      const displayName = user?.displayName || 'Unknown';

      socket.to(room).emit('ptt:speaking', {
        groupId, userId, displayName, startedAt: new Date().toISOString(),
      });

      const socketsInRoom = await io.in(room).fetchSockets();
      const onlineUserIds = new Set(
        socketsInRoom.map((s) => (s as unknown as Socket).user?.userId).filter(Boolean),
      );

      const pushTokens = await prisma.pttPushToken.findMany({
        where: { groupId, NOT: { userId: { in: [...onlineUserIds] } } },
        select: { token: true },
      });

      if (pushTokens.length > 0) {
        notifyTransmissionStarted(
          pushTokens.map((t) => t.token),
          groupId, userId, displayName,
        ).catch((err) => logger.error({ err }, '[PTT] APNs notify start failed'));
      }

      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { parentGroupId: true, type: true },
      });

      if (group?.parentGroupId) {
        socket.to(`ptt:${group.parentGroupId}`).emit('ptt:speaking', {
          groupId, userId, displayName,
          startedAt: new Date().toISOString(),
          fromSubGroup: true,
        });
      }

      // Start server-side LiveKit egress — this is the only path that actually
      // records audio for iOS native PTT, since the client can't capture its
      // own mic while LiveKit owns it.
      logger.info(`[PTT] invoking startTransmissionEgress for ${userId} / ${groupId}`);
      startTransmissionEgress(groupId, userId).catch(
        (err) => logger.warn({ err }, '[PTT] Egress start failed'),
      );

      logger.info(`[PTT] ${userId} started transmitting in ${room}`);
    } catch (error) {
      logger.error({ err: error }, '[PTT] Error starting transmission');
      socket.emit('ptt:error', { message: 'Failed to start transmission' });
    }
  });

  socket.on('ptt:stop', async (data: { groupId: string }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    const { groupId } = data;
    const ctx = await authorizeGroupOrFail(groupId, 'ptt:stop');
    if (!ctx) return;
    const room = `ptt:${groupId}`;

    try {
      const endedAt = new Date().toISOString();
      socket.to(room).emit('ptt:stopped', { groupId, userId, endedAt });

      const pushTokensForStop = await prisma.pttPushToken.findMany({
        where: { groupId },
        select: { token: true },
      });
      if (pushTokensForStop.length > 0) {
        notifyTransmissionStopped(
          pushTokensForStop.map((t) => t.token), groupId,
        ).catch((err) => logger.error({ err }, '[PTT] APNs notify stop failed'));
      }

      // Stop LiveKit egress
      stopTransmissionEgress(userId, groupId).catch(
        (err) => logger.warn({ err }, '[PTT] Egress stop failed'),
      );

      // Retrieve and flush Redis session + chunks
      const sessionKey = `ptt:session:${userId}:${groupId}`;
      const chunksKey  = `ptt:chunks:${userId}:${groupId}`;
      const [sessionData, chunks64] = await Promise.all([
        redis.hgetall(sessionKey),
        redis.lrange(chunksKey, 0, -1),
      ]);
      await redis.del(sessionKey, chunksKey);

      if (chunks64.length > 0 && sessionData?.startedAt) {
        const chunks    = chunks64.map((b) => Buffer.from(b, 'base64'));
        const startedAt = parseInt(sessionData.startedAt, 10);
        const mimeType  = sessionData.mimeType || 'audio/webm';

        const result = await savePttLog(userId, groupId, chunks, mimeType, startedAt);
        if (result) {
          io.to(room).emit('ptt:log_saved', {
            groupId, userId,
            displayName: result.displayName,
            audioUrl: result.audioUrl,
            durationMs: result.durationMs,
            createdAt: endedAt,
          });
        }
      }
      // Native clients upload audio via POST /ptt/:groupId/audio and then
      // emit ptt:native_log with the audioUrl — no server-side polling needed.

      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { parentGroupId: true },
      });

      if (group?.parentGroupId) {
        socket.to(`ptt:${group.parentGroupId}`).emit('ptt:stopped', {
          groupId, userId, endedAt, fromSubGroup: true,
        });
      }

      logger.debug(`[PTT] ${userId} stopped transmitting in ${room}`);
    } catch (error) {
      logger.error({ err: error }, '[PTT] Error stopping transmission');
    }
  });

  // Native client submits a completed recording after upload
  socket.on('ptt:native_log', async (data: { groupId: string; audioUrl?: string; durationMs: number }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    const ctx = await authorizeGroupOrFail(data.groupId, 'ptt:native_log');
    if (!ctx) return;

    // Drop arbitrary URLs — only accept Supabase-hosted ones (we'd be the
    // ones who signed them). Same defence as the HTTP nativeLog.
    let safeAudioUrl: string | undefined;
    if (data.audioUrl) {
      try {
        const u = new URL(data.audioUrl);
        const supabaseHost = new URL(env.SUPABASE_URL).hostname;
        if (u.protocol === 'https:' && u.hostname === supabaseHost) {
          safeAudioUrl = data.audioUrl;
        }
      } catch { /* drop */ }
    }
    const safeDurationMs =
      Number.isFinite(data.durationMs) && data.durationMs >= 0 && data.durationMs < 60 * 60 * 1000
        ? Math.floor(data.durationMs)
        : 0;

    try {
      const savedLog = await prisma.pttLog.create({
        data: {
          groupId: data.groupId,
          senderId: userId,
          durationMs: safeDurationMs,
          ...(safeAudioUrl ? { audioUrl: safeAudioUrl } : {}),
        },
      });
      const room = `ptt:${data.groupId}`;
      const createdAt = savedLog.createdAt.toISOString();
      io.to(room).emit('ptt:log_saved', {
        id: savedLog.id,
        groupId: data.groupId,
        userId,
        displayName: ctx.displayName,
        audioUrl: safeAudioUrl,
        durationMs: safeDurationMs,
        createdAt,
      });
    } catch (err) {
      logger.error({ err }, '[PTT] Failed to save native log');
    }
  });

  // Relay raw audio chunk to other web clients and buffer in Redis for durable log.
  socket.on('ptt:audio_chunk', async (data: { groupId: string; chunk: ArrayBuffer; mimeType: string }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    const ctx = await authorizeGroupOrFail(data.groupId, 'ptt:audio_chunk');
    if (!ctx) return;
    const room = `ptt:${data.groupId}`;
    socket.to(room).emit('ptt:audio_chunk', { chunk: data.chunk, mimeType: data.mimeType });

    const chunksKey = `ptt:chunks:${userId}:${data.groupId}`;
    redis.rpush(chunksKey, Buffer.from(data.chunk).toString('base64'))
      .then(async (len) => { if (len === 1) await redis.expire(chunksKey, SESSION_TTL); })
      .catch((err) => logger.error({ err }, '[PTT] Failed to buffer chunk'));
  });

  socket.on('disconnect', () => {
    for (const room of socket.rooms) {
      if (room.startsWith('ptt:')) {
        const groupId = room.replace('ptt:', '');
        io.to(room).emit('ptt:member_left', { userId, groupId });

        // If the user dropped mid-transmission, tell peers immediately so their
        // UI clears the active-speaker indicator rather than spinning forever.
        // The session key is a Redis hash (written with HSET in ptt:start), so
        // we must use EXISTS rather than GET — calling GET on a hash returns a
        // WRONGTYPE error that silently swallows the ptt:stopped notification,
        // leaving every peer stuck in the RECEIVING state indefinitely.
        const sessionKey = `ptt:session:${userId}:${groupId}`;
        const chunksKey  = `ptt:chunks:${userId}:${groupId}`;
        redis.exists(sessionKey).then(async (exists) => {
          if (exists > 0) {
            const endedAt = new Date().toISOString();
            io.to(room).emit('ptt:stopped', { groupId, userId, endedAt });

            // Also notify the parent (lead) group room so lead-group members
            // don't get stuck in RECEIVING when a sub-group user drops abruptly.
            try {
              const group = await prisma.group.findUnique({
                where: { id: groupId },
                select: { parentGroupId: true },
              });
              if (group?.parentGroupId) {
                io.to(`ptt:${group.parentGroupId}`).emit('ptt:stopped', {
                  groupId, userId, endedAt, fromSubGroup: true,
                });
              }
            } catch { /* non-fatal */ }

            redis.del(sessionKey, chunksKey).catch(() => null);
          }
        }).catch(() => null);

        stopTransmissionEgress(userId, groupId).catch(
          (err) => logger.warn({ err }, '[PTT] Egress stop on disconnect failed'),
        );
      }
    }
  });
}
