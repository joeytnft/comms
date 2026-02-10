import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { NotFoundError, AuthorizationError, ValidationError } from '../utils/errors';

interface TriggerBody {
  level: 'ATTENTION' | 'WARNING' | 'EMERGENCY';
  message?: string;
  latitude?: number;
  longitude?: number;
}

interface AlertParams {
  id: string;
}

const ALERT_SELECT = {
  id: true,
  organizationId: true,
  triggeredById: true,
  level: true,
  message: true,
  latitude: true,
  longitude: true,
  resolvedAt: true,
  resolvedById: true,
  createdAt: true,
  triggeredBy: { select: { id: true, displayName: true } },
  acknowledgments: {
    select: {
      userId: true,
      acknowledgedAt: true,
    },
  },
};

export async function triggerAlert(
  request: FastifyRequest<{ Body: TriggerBody }>,
  reply: FastifyReply,
) {
  const { level, message, latitude, longitude } = request.body;
  const { userId, organizationId } = request;

  if (!level || !['ATTENTION', 'WARNING', 'EMERGENCY'].includes(level)) {
    throw new ValidationError('Invalid alert level');
  }

  const alert = await prisma.alert.create({
    data: {
      organizationId,
      triggeredById: userId,
      level,
      message: message || null,
      latitude: latitude || null,
      longitude: longitude || null,
    },
    select: ALERT_SELECT,
  });

  reply.status(201).send({ alert });
}

export async function listAlerts(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { organizationId } = request;
  const query = request.query as { cursor?: string; limit?: string; active?: string };
  const limit = Math.min(parseInt(query.limit || '20', 10), 50);

  const where: Record<string, unknown> = { organizationId };

  // Filter active (unresolved) alerts only
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
  const { id } = request.params;
  const { userId, organizationId } = request;

  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert) throw new NotFoundError('Alert');
  if (alert.organizationId !== organizationId) {
    throw new AuthorizationError('Alert does not belong to your organization');
  }

  // Upsert acknowledgment (idempotent)
  await prisma.alertAcknowledgment.upsert({
    where: { alertId_userId: { alertId: id, userId } },
    create: { alertId: id, userId },
    update: {},
  });

  const updated = await prisma.alert.findUnique({
    where: { id },
    select: ALERT_SELECT,
  });

  reply.send({ alert: updated });
}

export async function resolveAlert(
  request: FastifyRequest<{ Params: AlertParams }>,
  reply: FastifyReply,
) {
  const { id } = request.params;
  const { userId, organizationId } = request;

  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert) throw new NotFoundError('Alert');
  if (alert.organizationId !== organizationId) {
    throw new AuthorizationError('Alert does not belong to your organization');
  }
  if (alert.resolvedAt) {
    reply.send({ alert });
    return;
  }

  const updated = await prisma.alert.update({
    where: { id },
    data: { resolvedAt: new Date(), resolvedById: userId },
    select: ALERT_SELECT,
  });

  reply.send({ alert: updated });
}
