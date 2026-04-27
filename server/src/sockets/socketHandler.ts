import { Server } from 'socket.io';
import { createVerifier } from 'fast-jwt';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { setupChatSocket } from './chatSocket';
import { setupPTTSocket } from './pttSocket';
import { setupAlertSocket } from './alertSocket';

interface SocketUser {
  userId: string;
  organizationId: string;
  // null when the user is an org admin (unscoped) or has no campus assignment.
  campusId: string | null;
}

declare module 'socket.io' {
  interface Socket {
    user: SocketUser;
  }
}

export function setupSocketHandlers(io: Server) {
  const verify = createVerifier({ key: env.JWT_SECRET });

  // Auth middleware — verify JWT before allowing connection
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = verify(token) as SocketUser & { iat: number; exp: number };
      socket.user = {
        userId: decoded.userId,
        organizationId: decoded.organizationId,
        // Carry campusId from the JWT so socket-side broadcasts can be scoped
        // by campus the same way the HTTP path is. Previously dropped — every
        // socket event ran org-wide regardless of the user's campus.
        campusId: decoded.campusId ?? null,
      };
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`[Socket] User connected: ${socket.user.userId} (${socket.id})`);

    // Join the user's organization room for org-wide broadcasts
    socket.join(`org:${socket.user.organizationId}`);
    // Join the per-campus room when the user has a campus assignment so
    // campus-scoped broadcasts can target them precisely.
    if (socket.user.campusId) {
      socket.join(`campus:${socket.user.campusId}`);
    }

    // Set up chat event handlers
    setupChatSocket(io, socket);

    // Set up PTT event handlers
    setupPTTSocket(io, socket);

    // Set up alert event handlers
    setupAlertSocket(io, socket);

    socket.on('disconnect', (reason) => {
      logger.info(`[Socket] User disconnected: ${socket.user.userId} (${reason})`);
    });

    socket.on('error', (error) => {
      logger.error({ err: error }, `[Socket] Error for user ${socket.user.userId}`);
    });
  });

  logger.info('[Socket.IO] Handlers registered');
}
