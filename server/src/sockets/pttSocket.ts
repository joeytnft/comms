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

      const filename = `ptt/${groupId}/${userId}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await getSupabase()
        .storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .upload(filename, audioBuffer, { contentType: finalMime, upsert: false });

      if (uploadErr) {
        logger.warn({ err: uploadErr }, '[PTT] Audio upload failed — logging call without recording');
      } else {
        const { data: { publicUrl } } = getSupabase()
          .storage
          .from(env.SUPABASE_STORAGE_BUCKET)
          .getPublicUrl(filename);
        audioUrl = publicUrl;
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
  const { userId } = socket.user;

  socket.on('ptt:join', async (data: { groupId: string }) => {
    if (!data || !isValidGroupId(data.groupId)) {
      socket.emit('ptt:error', { message: 'Invalid groupId' });
      return;
    }
    const { groupId } = data;

    const membership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      include: { user: { select: { displayName: true } } },
    });

    if (!membership) {
      socket.emit('ptt:error', { message: 'Not a member of this group' });
      return;
    }

    const room = `ptt:${groupId}`;
    socket.join(room);

    socket.to(room).emit('ptt:member_joined', {
      userId,
      displayName: membership.user.displayName,
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

  socket.on('ptt:leave', (data: { groupId: string }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    const room = `ptt:${data.groupId}`;
    socket.leave(room);
    socket.to(room).emit('ptt:member_left', { userId, groupId: data.groupId });
    logger.info(`[PTT] ${userId} left PTT room ${room}`);
  });

  socket.on('ptt:start', async (data: { groupId: string; mimeType?: string }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    const { groupId } = data;
    const room = `ptt:${groupId}`;
    const mimeType = data.mimeType || 'audio/webm';

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

      // Start server-side LiveKit egress as backup for native clients that drop.
      startTransmissionEgress(groupId, userId).catch(
        (err) => logger.warn({ err }, '[PTT] Egress start failed'),
      );

      logger.debug(`[PTT] ${userId} started transmitting in ${room}`);
    } catch (error) {
      logger.error({ err: error }, '[PTT] Error starting transmission');
      socket.emit('ptt:error', { message: 'Failed to start transmission' });
    }
  });

  socket.on('ptt:stop', async (data: { groupId: string }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    const { groupId } = data;
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
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      await prisma.pttLog.create({
        data: {
          groupId: data.groupId,
          senderId: userId,
          durationMs: data.durationMs || 0,
          ...(data.audioUrl ? { audioUrl: data.audioUrl } : {}),
        },
      });
      const room = `ptt:${data.groupId}`;
      const createdAt = new Date().toISOString();
      io.to(room).emit('ptt:log_saved', {
        groupId: data.groupId,
        userId,
        displayName: user?.displayName ?? 'Unknown',
        audioUrl: data.audioUrl,
        durationMs: data.durationMs || 0,
        createdAt,
      });
    } catch (err) {
      logger.error({ err }, '[PTT] Failed to save native log');
    }
  });

  // Relay raw audio chunk to other web clients and buffer in Redis for durable log.
  socket.on('ptt:audio_chunk', (data: { groupId: string; chunk: ArrayBuffer; mimeType: string }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
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
        socket.to(room).emit('ptt:member_left', { userId, groupId });
      }
    }
  });
}
