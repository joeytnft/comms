import { Server, Socket } from 'socket.io';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Alert socket events for real-time alert broadcasting.
 * When an alert is triggered, it broadcasts to the entire organization.
 */
export function setupAlertSocket(io: Server, socket: Socket) {
  const { userId, organizationId } = socket.user;

  // Trigger an alert — broadcast to entire organization
  socket.on('alert:trigger', async (data: {
    level: string;
    message?: string;
    latitude?: number;
    longitude?: number;
  }) => {
    const { level, message, latitude, longitude } = data;

    if (!['ATTENTION', 'WARNING', 'EMERGENCY'].includes(level)) {
      socket.emit('alert:error', { message: 'Invalid alert level' });
      return;
    }

    try {
      const alert = await prisma.alert.create({
        data: {
          organizationId,
          triggeredById: userId,
          level: level as 'ATTENTION' | 'WARNING' | 'EMERGENCY',
          message: message || null,
          latitude: latitude || null,
          longitude: longitude || null,
        },
        include: {
          triggeredBy: { select: { displayName: true } },
        },
      });

      // Broadcast to entire organization
      io.to(`org:${organizationId}`).emit('alert:new', {
        id: alert.id,
        level: alert.level,
        message: alert.message,
        latitude: alert.latitude,
        longitude: alert.longitude,
        triggeredBy: {
          userId,
          displayName: alert.triggeredBy.displayName,
        },
        createdAt: alert.createdAt.toISOString(),
      });

      logger.info(`[Alert] ${level} triggered by ${userId} in org ${organizationId}`);
    } catch (error) {
      logger.error({ err: error }, '[Alert] Failed to create alert');
      socket.emit('alert:error', { message: 'Failed to trigger alert' });
    }
  });

  // Acknowledge an alert
  socket.on('alert:acknowledge', async (data: { alertId: string }) => {
    try {
      await prisma.alertAcknowledgment.upsert({
        where: { alertId_userId: { alertId: data.alertId, userId } },
        create: { alertId: data.alertId, userId },
        update: {},
      });

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });

      io.to(`org:${organizationId}`).emit('alert:acknowledged', {
        alertId: data.alertId,
        userId,
        displayName: user?.displayName,
      });
    } catch (error) {
      logger.error({ err: error }, '[Alert] Failed to acknowledge alert');
    }
  });

  // Resolve an alert
  socket.on('alert:resolve', async (data: { alertId: string }) => {
    try {
      await prisma.alert.update({
        where: { id: data.alertId },
        data: { resolvedAt: new Date(), resolvedById: userId },
      });

      io.to(`org:${organizationId}`).emit('alert:resolved', {
        alertId: data.alertId,
        resolvedBy: userId,
      });
    } catch (error) {
      logger.error({ err: error }, '[Alert] Failed to resolve alert');
    }
  });
}
