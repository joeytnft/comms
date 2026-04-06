import { Server, Socket } from 'socket.io';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

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
  socket.on('ptt:start', async (data: { groupId: string }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    const { groupId } = data;
    const room = `ptt:${groupId}`;

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });

      // Broadcast to everyone in the PTT room that this user is speaking
      socket.to(room).emit('ptt:speaking', {
        groupId,
        userId,
        displayName: user?.displayName || 'Unknown',
        startedAt: new Date().toISOString(),
      });

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
      socket.to(room).emit('ptt:stopped', {
        groupId,
        userId,
        endedAt: new Date().toISOString(),
      });

      // Also notify parent LEAD group
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { parentGroupId: true },
      });

      if (group?.parentGroupId) {
        const parentRoom = `ptt:${group.parentGroupId}`;
        socket.to(parentRoom).emit('ptt:stopped', {
          groupId,
          userId,
          endedAt: new Date().toISOString(),
          fromSubGroup: true,
        });
      }

      logger.debug(`[PTT] ${userId} stopped transmitting in ${room}`);
    } catch (error) {
      logger.error({ err: error }, '[PTT] Error stopping transmission');
    }
  });

  // Relay raw audio chunk to other members in the PTT room (web clients)
  socket.on('ptt:audio_chunk', (data: { groupId: string; chunk: ArrayBuffer; mimeType: string }) => {
    if (!data || !isValidGroupId(data.groupId)) return;
    const room = `ptt:${data.groupId}`;
    socket.to(room).emit('ptt:audio_chunk', { chunk: data.chunk, mimeType: data.mimeType });
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
