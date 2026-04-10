import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { NotFoundError, AuthorizationError, ValidationError } from '../utils/errors';
import * as alertService from '../services/alerts/alertService';
import { ALERT_SELECT } from '../services/alerts/alertService';

interface TriggerBody {
  level: 'ATTENTION' | 'WARNING' | 'EMERGENCY';
  alertType?: string;
  message?: string;
  latitude?: number;
  longitude?: number;
  priorityTone?: boolean;
  photoUrl?: string;
  groupIds?: string[]; // Empty/absent = global (all groups)
}

interface AlertParams {
  id: string;
}

export async function triggerAlert(
  request: FastifyRequest<{ Body: TriggerBody }>,
  reply: FastifyReply,
) {
  const { level, alertType, message, latitude, longitude, priorityTone, photoUrl, groupIds } = request.body;
  const { userId, organizationId, campusId } = request;

  if (!level || !['ATTENTION', 'WARNING', 'EMERGENCY'].includes(level)) {
    throw new ValidationError('Invalid alert level');
  }

  // User must be in at least one alerts-enabled group
  const userGroupIds = await alertService.getUserVisibleGroupIds(userId, organizationId);
  if (userGroupIds.length === 0) {
    throw new AuthorizationError('Your groups do not have alerts enabled');
  }

  // If groupIds are specified, verify the user is actually a member of each one
  if (groupIds && groupIds.length > 0) {
    const invalid = groupIds.filter((gid) => !userGroupIds.includes(gid));
    if (invalid.length > 0) {
      throw new AuthorizationError('You are not a member of one or more specified groups');
    }
  }

  const alert = await alertService.createAlert({
    organizationId,
    campusId: campusId ?? null,
    triggeredById: userId,
    level,
    alertType,
    message,
    latitude,
    longitude,
    priorityTone,
    photoUrl,
    groupIds: groupIds && groupIds.length > 0 ? groupIds : undefined,
  });

  reply.status(201).send({ alert });
}

export async function listAlerts(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { userId, organizationId, campusId } = request;
  const query = request.query as { cursor?: string; limit?: string; active?: string };
  const limit = Math.min(parseInt(query.limit || '20', 10), 50);

  // Get the groups the user is a member of (with alerts enabled)
  const userGroupIds = await alertService.getUserVisibleGroupIds(userId, organizationId);
  if (userGroupIds.length === 0) {
    return reply.send({ alerts: [], nextCursor: null });
  }

  const where: Record<string, unknown> = {
    organizationId,
    ...(campusId ? { campusId } : {}),
    // Show global alerts (no targetGroups) OR alerts targeted at user's groups
    OR: [
      { targetGroups: { none: {} } },
      { targetGroups: { some: { groupId: { in: userGroupIds } } } },
    ],
  };

  if (query.active === 'true') {
    where.resolvedAt = null;
  }

  const alerts = await prisma.alert.findMany({
    where,
    select: ALERT_SELECT,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const hasMore = alerts.length > limit;
  const results = hasMore ? alerts.slice(0, limit) : alerts;
  const nextCursor = hasMore ? results[results.length - 1].id : null;

  reply.send({ alerts: results, nextCursor });
}

export async function getAlert(
  request: FastifyRequest<{ Params: AlertParams }>,
  reply: FastifyReply,
) {
  const alert = await prisma.alert.findUnique({
    where: { id: request.params.id },
    select: ALERT_SELECT,
  });

  if (!alert) throw new NotFoundError('Alert');
  if (alert.organizationId !== request.organizationId) {
    throw new AuthorizationError('Alert does not belong to your organization');
  }

  reply.send({ alert });
}

export async function acknowledgeAlert(
  request: FastifyRequest<{ Params: AlertParams }>,
  reply: FastifyReply,
) {
  const updated = await alertService.acknowledgeAlert(
    request.params.id,
    request.userId,
    request.organizationId,
  );

  reply.send({ alert: updated });
}

export async function deleteAlert(
  request: FastifyRequest<{ Params: AlertParams }>,
  reply: FastifyReply,
) {
  await alertService.deleteAlertById(
    request.params.id,
    request.userId,
    request.organizationId,
  );

  reply.status(204).send();
}

export async function resolveAlert(
  request: FastifyRequest<{ Params: AlertParams }>,
  reply: FastifyReply,
) {
  const updated = await alertService.resolveAlertById(
    request.params.id,
    request.userId,
    request.organizationId,
  );

  reply.send({ alert: updated });
}
