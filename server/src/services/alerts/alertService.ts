import { prisma } from '../../config/database';
import { NotFoundError, AuthorizationError } from '../../utils/errors';
import { sendAlertPushNotifications } from '../notifications/pushService';

const ALERT_SELECT = {
  id: true,
  organizationId: true,
  triggeredById: true,
  level: true,
  alertType: true,
  message: true,
  latitude: true,
  longitude: true,
  priorityTone: true,
  photoUrl: true,
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
  targetGroups: {
    select: {
      group: { select: { id: true, name: true } },
    },
  },
} as const;

export { ALERT_SELECT };

export async function createAlert(params: {
  organizationId: string;
  campusId?: string | null;
  triggeredById: string;
  level: 'ATTENTION' | 'WARNING' | 'EMERGENCY';
  alertType?: string | null;
  message?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  priorityTone?: boolean;
  photoUrl?: string | null;
  groupIds?: string[];
}) {
  const alert = await prisma.alert.create({
    data: {
      organizationId: params.organizationId,
      campusId: params.campusId || null,
      triggeredById: params.triggeredById,
      level: params.level,
      alertType: params.alertType || null,
      message: params.message || null,
      latitude: params.latitude || null,
      longitude: params.longitude || null,
      priorityTone: params.priorityTone ?? false,
      photoUrl: params.photoUrl || null,
    },
    select: ALERT_SELECT,
  });

  if (params.groupIds && params.groupIds.length > 0) {
    // Fan-out: for every targeted sub-group, also include its lead group so
    // lead-group members always receive the alert.
    const groups = await prisma.group.findMany({
      where: { id: { in: params.groupIds } },
      select: { id: true, parentGroupId: true },
    });

    const allTargetIds = new Set(params.groupIds);
    for (const g of groups) {
      if (g.parentGroupId) allTargetIds.add(g.parentGroupId);
    }

    await prisma.alertGroupTarget.createMany({
      data: [...allTargetIds].map((groupId) => ({ alertId: alert.id, groupId })),
      skipDuplicates: true,
    });

    // Re-fetch with targets populated
    return prisma.alert.findUniqueOrThrow({ where: { id: alert.id }, select: ALERT_SELECT });
  }

  // Send push notifications to org members (fire-and-forget)
  const triggererName = alert.triggeredBy.displayName;
  sendAlertPushNotifications(
    params.organizationId,
    alert.id,
    alert.level,
    alert.message ?? null,
    triggererName,
  ).catch(() => {
    // Push notifications are best-effort; don't block the response
  });

  return alert;
}

export async function getUserVisibleGroupIds(userId: string, organizationId: string): Promise<string[]> {
  const memberships = await prisma.groupMembership.findMany({
    where: { userId, group: { organizationId, alertsEnabled: true } },
    select: { groupId: true },
  });
  return memberships.map((m) => m.groupId);
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

export async function deleteAlertById(alertId: string, userId: string, organizationId: string) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) throw new NotFoundError('Alert');
  if (alert.organizationId !== organizationId) {
    throw new AuthorizationError('Alert does not belong to your organization');
  }

  // Only the alert triggerer or a group admin can delete alerts
  if (alert.triggeredById !== userId) {
    const adminMembership = await prisma.groupMembership.findFirst({
      where: { userId, role: 'ADMIN', group: { organizationId } },
    });
    if (!adminMembership) {
      throw new AuthorizationError('Only the alert creator or a group admin can delete alerts');
    }
  }

  await prisma.alert.delete({ where: { id: alertId } });
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
