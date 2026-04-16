import { Server, Socket } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import {
  notifyTransmissionStarted,
  notifyTransmissionStopped,
} from '../services/apns/pttPushService';

// In-memory store: "userId:groupId" → { chunks, startedAt, mimeType }
const activeSessions = new Map<string, { chunks: Buffer[]; startedAt: number; mimeType: string }>();

async function saveWebPttLog(
  userId: string,
  groupId: string,
  chunks: Buffer[],
  mimeType: string,
  startedAt: number,
): Promise<{ audioUrl: string; durationMs: number; displayName: string } | null> {
  try {
    const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
    const filename = `ptt_${userId}_${Date.now()}.${ext}`;
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, Buffer.concat(chunks));
    const durationMs = Date.now() - startedAt;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    await prisma.pttLog.create({
      data: { groupId, senderId: userId, audioUrl: `/files/${filename}`, durationMs },
    });
    logger.info(`[PTT] Saved voice log: ${filename} (${durationMs}ms)`);
    return { audioUrl: `/files/${filename}`, durationMs, displayName: user?.displayName ?? 'Unknown' };
  } catch (err) {
    logger.error({ err }, '[PTT] Failed to save voice log');
    return null;
  }
}

/**
 * PTT socket events for signaling who is speaking.
 * Actual audio goes through LiveKit — these events handle:
 * - Joining/leaving PTT channels
 * - Broadcasting who started/stopped talking
 * - Member presence in PTT rooms
 */
function isValidGroupId(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0 && val.length <= 64;
}

export function setupPTTSocket(io: Server, socket: Socket) {
  const { userId } = socket.user;

  // User joins a group's PTT channel
  socket.on('ptt:join', async (data: { groupId: string }) => {
    if (!data || !isValidGroupId(data.groupId)) {
      socket.emit('ptt:error', { message: 'Invalid groupId' });
      return;
    }
    const { groupId } = data;

    // Verify membership
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

    // Notify others that this user joined the PTT channel
    socket.to(room).emit('ptt:member_joined', {
      userId,
      displayName: membership.user.displayName,
      groupId,
    });

    // Send current members in the room back to the joiner
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

  // User leaves a group's PTT channel
  socket.on('ptt:leave', (data: { groupId: string }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    const room = `ptt:${data.groupId}`;
    socket.leave(room);

    socket.to(room).emit('ptt:member_left', {
      userId,
      groupId: data.groupId,
    });

    logger.info(`[PTT] ${userId} left PTT room ${room}`);
  });

  // User started transmitting (pressed PTT button)
  socket.on('ptt:start', async (data: { groupId: string; mimeType?: string }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    const { groupId } = data;
    const room = `ptt:${groupId}`;
    // Initialize chunk buffer for this web session
    activeSessions.set(`${userId}:${groupId}`, {
      chunks: [],
      startedAt: Date.now(),
      mimeType: data.mimeType || 'audio/webm',
    });

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });

      const displayName = user?.displayName || 'Unknown';

      // Broadcast to everyone in the PTT room that this user is speaking
      socket.to(room).emit('ptt:speaking', {
        groupId,
        userId,
        displayName,
        startedAt: new Date().toISOString(),
      });

      // Send APNs pushtotalk push to iOS members who are NOT connected via socket
      // (i.e., app is in background / closed — PTT framework wakes them)
      const socketsInRoom = await io.in(room).fetchSockets();
      const onlineUserIds = new Set(
        socketsInRoom.map((s) => (s as unknown as Socket).user?.userId).filter(Boolean),
      );

      const pushTokens = await prisma.pttPushToken.findMany({
        where: {
          groupId,
          NOT: { userId: { in: [...onlineUserIds] } }, // exclude already-connected users
        },
        select: { token: true },
      });

      if (pushTokens.length > 0) {
        notifyTransmissionStarted(
          pushTokens.map((t) => t.token),
          groupId,
          userId,
          displayName,
        ).catch((err) => logger.error({ err }, '[PTT] APNs notify start failed'));
      }

      // Also broadcast to parent LEAD group if this is a SUB group
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { parentGroupId: true, type: true },
      });

      if (group?.parentGroupId) {
        const parentRoom = `ptt:${group.parentGroupId}`;
        socket.to(parentRoom).emit('ptt:speaking', {
          groupId,
          userId,
          displayName: user?.displayName || 'Unknown',
          startedAt: new Date().toISOString(),
          fromSubGroup: true,
        });
      }

      logger.debug(`[PTT] ${userId} started transmitting in ${room}`);
    } catch (error) {
      logger.error({ err: error }, '[PTT] Error starting transmission');
      socket.emit('ptt:error', { message: 'Failed to start transmission' });
    }
  });

  // User stopped transmitting (released PTT button)
  socket.on('ptt:stop', async (data: { groupId: string }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    const { groupId } = data;
    const room = `ptt:${groupId}`;

    try {
      const endedAt = new Date().toISOString();
      socket.to(room).emit('ptt:stopped', { groupId, userId, endedAt });

      // Notify background iOS clients that transmission ended
      const pushTokensForStop = await prisma.pttPushToken.findMany({
        where: { groupId },
        select: { token: true },
      });
      if (pushTokensForStop.length > 0) {
        notifyTransmissionStopped(
          pushTokensForStop.map((t) => t.token),
          groupId,
        ).catch((err) => logger.error({ err }, '[PTT] APNs notify stop failed'));
      }

      // Save web audio log if chunks exist
      const sessionKey = `${userId}:${groupId}`;
      const session = activeSessions.get(sessionKey);
      activeSessions.delete(sessionKey);
      if (session && session.chunks.length > 0) {
        const result = await saveWebPttLog(userId, groupId, session.chunks, session.mimeType, session.startedAt);
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

      // Also notify parent LEAD group
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { parentGroupId: true },
      });

      if (group?.parentGroupId) {
        const parentRoom = `ptt:${group.parentGroupId}`;
        socket.to(parentRoom).emit('ptt:stopped', {
          groupId, userId, endedAt, fromSubGroup: true,
        });
      }

      logger.debug(`[PTT] ${userId} stopped transmitting in ${room}`);
    } catch (error) {
      logger.error({ err: error }, '[PTT] Error stopping transmission');
    }
  });

  // Native client submits a completed recording after upload
  socket.on('ptt:native_log', async (data: { groupId: string; audioUrl: string; durationMs: number }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
      await prisma.pttLog.create({
        data: { groupId: data.groupId, senderId: userId, audioUrl: data.audioUrl, durationMs: data.durationMs || 0 },
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

  // Relay raw audio chunk to other members in the PTT room (web clients) and buffer for log
  socket.on('ptt:audio_chunk', (data: { groupId: string; chunk: ArrayBuffer; mimeType: string }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    const room = `ptt:${data.groupId}`;
    socket.to(room).emit('ptt:audio_chunk', { chunk: data.chunk, mimeType: data.mimeType });
    // Buffer chunk for log
    const session = activeSessions.get(`${userId}:${data.groupId}`);
    if (session) session.chunks.push(Buffer.from(data.chunk));
  });

  // Clean up PTT rooms on disconnect
  socket.on('disconnect', () => {
    // Socket.IO auto-removes from all rooms on disconnect.
    // But we should notify rooms the user was in.
    // The rooms are cleaned up by Socket.IO, so we emit
    // to rooms the user was in before disconnect.
    for (const room of socket.rooms) {
      if (room.startsWith('ptt:')) {
        const groupId = room.replace('ptt:', '');
        socket.to(room).emit('ptt:member_left', {
          userId,
          groupId,
        });
      }
    }
  });
}
