import { prisma } from '../../config/database';
import { NotFoundError, AuthorizationError } from '../../utils/errors';
import { sendAlertPushNotifications, sendCriticalAlertPushNotification } from '../notifications/pushService';

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

  // Active Shooter alerts bypass group targeting entirely — they always broadcast
  // to the entire organization regardless of which group triggered them.
  const shouldTargetGroups =
    params.alertType !== 'ACTIVE_SHOOTER' &&
    params.groupIds != null &&
    params.groupIds.length > 0;

  if (shouldTargetGroups) {
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
  }

  // Send push notifications — always fires regardless of group targeting
  const triggererName = alert.triggeredBy?.displayName ?? 'Unknown';
  if (params.alertType === 'ACTIVE_SHOOTER') {
    sendCriticalAlertPushNotification(params.organizationId, alert.id, triggererName).catch(
      () => {},
    );
  } else {
    sendAlertPushNotifications(
      params.organizationId,
      alert.id,
      alert.level,
      alert.message ?? null,
      triggererName,
    ).catch(() => {});
  }

  if (shouldTargetGroups) {
    return prisma.alert.findUniqueOrThrow({ where: { id: alert.id }, select: ALERT_SELECT });
  }
  return alert;
}

/**
 * Permission gate for delete/resolve. Allows:
 *   - Org admins (org-wide)
 *   - Admins of any group the alert targeted
 *   - Admins of a group in the alert's campus when the alert has no targets
 *     (e.g. ACTIVE_SHOOTER which broadcasts org/campus-wide)
 *
 * Was previously "any group admin in the org", which let Campus A admins
 * delete Campus B alerts. Throws AuthorizationError when the caller does
 * not satisfy any of the above.
 */
async function assertCanManageAlert(
  alertId: string,
  userId: string,
  organizationId: string,
): Promise<void> {
  const orgAdmin = await prisma.user.findFirst({
    where: { id: userId, isOrgAdmin: true, organizationId },
    select: { id: true },
  });
  if (orgAdmin) return;

  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: {
      campusId: true,
      targetGroups: { select: { groupId: true } },
    },
  });
  if (!alert) throw new NotFoundError('Alert');

  const targetGroupIds = alert.targetGroups.map((g) => g.groupId);

  if (targetGroupIds.length > 0) {
    const adminOfTarget = await prisma.groupMembership.findFirst({
      where: {
        userId,
        role: 'ADMIN',
        groupId: { in: targetGroupIds },
      },
      select: { id: true },
    });
    if (adminOfTarget) return;
  } else if (alert.campusId) {
    // Campus-scoped alert with no explicit groups (e.g. broadcast); any
    // group admin within that campus may manage it.
    const adminInCampus = await prisma.groupMembership.findFirst({
      where: {
        userId,
        role: 'ADMIN',
        group: { organizationId, campusId: alert.campusId },
      },
      select: { id: true },
    });
    if (adminInCampus) return;
  } else {
    // Org-wide alert with no campus and no target groups (legacy): any group
    // admin in the org may manage it. This preserves prior behaviour for
    // org-wide alerts without leaking cross-campus authority for scoped ones.
    const adminInOrg = await prisma.groupMembership.findFirst({
      where: { userId, role: 'ADMIN', group: { organizationId } },
      select: { id: true },
    });
    if (adminInOrg) return;
  }

  throw new AuthorizationError(
    'Only the alert creator, an org admin, or an admin of a targeted group can manage this alert',
  );
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

  if (alert.triggeredById !== userId) {
    await assertCanManageAlert(alert.id, userId, organizationId);
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

  if (alert.triggeredById !== userId) {
    await assertCanManageAlert(alert.id, userId, organizationId);
  }

  return prisma.alert.update({
    where: { id: alertId },
    data: { resolvedAt: new Date(), resolvedById: userId },
    select: ALERT_SELECT,
  });
}
