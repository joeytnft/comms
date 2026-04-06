import { prisma } from '../../config/database';
import { NotFoundError, AuthorizationError } from '../../utils/errors';

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
} as const;

export { ALERT_SELECT };

export async function createAlert(params: {
  organizationId: string;
  triggeredById: string;
  level: 'ATTENTION' | 'WARNING' | 'EMERGENCY';
  message?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  return prisma.alert.create({
    data: {
      organizationId: params.organizationId,
      triggeredById: params.triggeredById,
      level: params.level,
      message: params.message || null,
      latitude: params.latitude || null,
      longitude: params.longitude || null,
    },
    select: ALERT_SELECT,
  });
}

export async function acknowledgeAlert(alertId: string, userId: string, organizationId: string) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) throw new NotFoundError('Alert');
  if (alert.organizationId !== organizationId) {
    throw new AuthorizationError('Alert does not belong to your organization');
  }

  await prisma.alertAcknowledgment.upsert({
    where: { alertId_userId: { alertId, userId } },
    create: { alertId, userId },
    update: {},
  });

  return prisma.alert.findUnique({
    where: { id: alertId },
    select: ALERT_SELECT,
  });
}

export async function resolveAlertById(alertId: string, userId: string, organizationId: string) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) throw new NotFoundError('Alert');
  if (alert.organizationId !== organizationId) {
    throw new AuthorizationError('Alert does not belong to your organization');
  }
  if (alert.resolvedAt) return alert;

  // Only the alert triggerer or a group admin can resolve alerts
  if (alert.triggeredById !== userId) {
    const adminMembership = await prisma.groupMembership.findFirst({
      where: { userId, role: 'ADMIN', group: { organizationId } },
    });
    if (!adminMembership) {
      throw new AuthorizationError('Only the alert creator or a group admin can resolve alerts');
    }
  }

  return prisma.alert.update({
    where: { id: alertId },
    data: { resolvedAt: new Date(), resolvedById: userId },
    select: ALERT_SELECT,
  });
}
