import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import * as alertService from '../services/alerts/alertService';

/**
 * Alert socket events for real-time alert broadcasting.
 * When an alert is triggered, it broadcasts to the entire organization.
 */
function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0;
}

export function setupAlertSocket(io: Server, socket: Socket) {
  const { userId, organizationId } = socket.user;

  // Trigger an alert — broadcast to entire organization
  socket.on('alert:trigger', async (data: {
    level: string;
    message?: string;
    latitude?: number;
    longitude?: number;
  }) => {
    if (!data || typeof data !== 'object') {
      socket.emit('alert:error', { message: 'Invalid alert data' });
      return;
    }

    const { level, message, latitude, longitude } = data;

    if (!['ATTENTION', 'WARNING', 'EMERGENCY'].includes(level)) {
      socket.emit('alert:error', { message: 'Invalid alert level' });
      return;
    }

    if (message != null && typeof message !== 'string') {
      socket.emit('alert:error', { message: 'Invalid message format' });
      return;
    }

    if ((latitude != null && typeof latitude !== 'number') || (longitude != null && typeof longitude !== 'number')) {
      socket.emit('alert:error', { message: 'Invalid coordinates' });
      return;
    }

    if (latitude != null && (latitude < -90 || latitude > 90 || longitude! < -180 || longitude! > 180)) {
      socket.emit('alert:error', { message: 'Coordinates out of range' });
      return;
    }

    try {
      const alert = await alertService.createAlert({
        organizationId,
        triggeredById: userId,
        level: level as 'ATTENTION' | 'WARNING' | 'EMERGENCY',
        message,
        latitude,
        longitude,
      });

      // Broadcast to entire organization
      io.to(`org:${organizationId}`).emit('alert:new', {
        id: alert.id,
        level: alert.level,
        message: alert.message,
        latitude: alert.latitude,
        longitude: alert.longitude,
        triggeredBy: alert.triggeredBy,
        createdAt: alert.createdAt,
      });

      logger.info(`[Alert] ${level} triggered by ${userId} in org ${organizationId}`);
    } catch (error) {
      logger.error({ err: error }, '[Alert] Failed to create alert');
      socket.emit('alert:error', { message: 'Failed to trigger alert' });
    }
  });

  // Acknowledge an alert
  socket.on('alert:acknowledge', async (data: { alertId: string }) => {
    if (!data || !isNonEmptyString(data.alertId)) {
      socket.emit('alert:error', { message: 'Invalid alertId' });
      return;
    }
    try {
      await alertService.acknowledgeAlert(data.alertId, userId, organizationId);

      io.to(`org:${organizationId}`).emit('alert:acknowledged', {
        alertId: data.alertId,
        userId,
      });
    } catch (error) {
      logger.error({ err: error }, '[Alert] Failed to acknowledge alert');
      socket.emit('alert:error', { message: 'Failed to acknowledge alert' });
    }
  });

  // Resolve an alert
  socket.on('alert:resolve', async (data: { alertId: string }) => {
    if (!data || !isNonEmptyString(data.alertId)) {
      socket.emit('alert:error', { message: 'Invalid alertId' });
      return;
    }
    try {
      await alertService.resolveAlertById(data.alertId, userId, organizationId);

      io.to(`org:${organizationId}`).emit('alert:resolved', {
        alertId: data.alertId,
        resolvedBy: userId,
      });
    } catch (error) {
      logger.error({ err: error }, '[Alert] Failed to resolve alert');
      socket.emit('alert:error', { message: 'Failed to resolve alert' });
    }
  });
}
