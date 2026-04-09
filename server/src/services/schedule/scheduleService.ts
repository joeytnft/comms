import { prisma } from '../../config/database';
import { NotFoundError, AuthorizationError, ValidationError } from '../../utils/errors';
import Expo from 'expo-server-sdk';

const expo = new Expo();

async function sendPushNotification(token: string, message: { title: string; body: string; data?: object }) {
  if (!Expo.isExpoPushToken(token)) return;
  await expo.sendPushNotificationsAsync([{ to: token, sound: 'default', ...message }]);
}

export const ASSIGNMENT_SELECT = {
  id: true,
  serviceId: true,
  userId: true,
  postId: true,
  role: true,
  notes: true,
  status: true,
  createdAt: true,
  user: { select: { id: true, displayName: true, avatarUrl: true } },
  post: { select: { id: true, name: true, zone: true } },
  checkIn: { select: { id: true, checkedInAt: true, checkedOutAt: true } },
  swapRequests: {
    where: { status: 'PENDING' as const },
    select: { id: true, toUserId: true, message: true, status: true, createdAt: true },
  },
} as const;

export const ROLE_SLOT_SELECT = {
  id: true,
  templateId: true,
  postId: true,
  roleName: true,
  count: true,
  post: { select: { id: true, name: true, zone: true } },
} as const;

export const TEMPLATE_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  dayOfWeek: true,
  startTime: true,
  description: true,
  isActive: true,
  createdById: true,
  createdAt: true,
  createdBy: { select: { id: true, displayName: true } },
  roleSlots: { select: ROLE_SLOT_SELECT },
  _count: { select: { services: true } },
} as const;

export const SERVICE_SELECT = {
  id: true,
  organizationId: true,
  templateId: true,
  name: true,
  serviceDate: true,
  description: true,
  createdById: true,
  createdAt: true,
  createdBy: { select: { id: true, displayName: true } },
  template: { select: { id: true, name: true, roleSlots: { select: ROLE_SLOT_SELECT } } },
  assignments: { select: ASSIGNMENT_SELECT, orderBy: { createdAt: 'asc' as const } },
} as const;

// ── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates(organizationId: string) {
  return prisma.serviceTemplate.findMany({
    where: { organizationId },
    select: TEMPLATE_SELECT,
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}

export async function createTemplate(params: {
  organizationId: string;
  createdById: string;
  name: string;
  dayOfWeek: number;
  startTime: string;
  description?: string;
}) {
  if (params.dayOfWeek < 0 || params.dayOfWeek > 6) {
    throw new ValidationError('dayOfWeek must be 0 (Sun) – 6 (Sat)');
  }
  return prisma.serviceTemplate.create({
    data: {
      organizationId: params.organizationId,
      createdById: params.createdById,
      name: params.name.trim(),
      dayOfWeek: params.dayOfWeek,
      startTime: params.startTime,
      description: params.description?.trim() || null,
    },
    select: TEMPLATE_SELECT,
  });
}

export async function updateTemplate(templateId: string, organizationId: string, data: {
  name?: string;
  dayOfWeek?: number;
  startTime?: string;
  description?: string;
  isActive?: boolean;
}) {
  const existing = await prisma.serviceTemplate.findUnique({ where: { id: templateId } });
  if (!existing) throw new NotFoundError('Template');
  if (existing.organizationId !== organizationId) throw new AuthorizationError('Not in your organization');

  return prisma.serviceTemplate.update({
    where: { id: templateId },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.dayOfWeek !== undefined ? { dayOfWeek: data.dayOfWeek } : {}),
      ...(data.startTime !== undefined ? { startTime: data.startTime } : {}),
      ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
    select: TEMPLATE_SELECT,
  });
}

export async function deleteTemplate(templateId: string, organizationId: string) {
  const existing = await prisma.serviceTemplate.findUnique({ where: { id: templateId } });
  if (!existing) throw new NotFoundError('Template');
  if (existing.organizationId !== organizationId) throw new AuthorizationError('Not in your organization');
  await prisma.serviceTemplate.delete({ where: { id: templateId } });
}

export async function addRoleSlot(templateId: string, organizationId: string, params: {
  roleName: string;
  postId?: string;
  count?: number;
}) {
  const template = await prisma.serviceTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new NotFoundError('Template');
  if (template.organizationId !== organizationId) throw new AuthorizationError('Not in your organization');

  return prisma.templateRoleSlot.create({
    data: {
      templateId,
      roleName: params.roleName.trim(),
      postId: params.postId || null,
      count: params.count ?? 1,
    },
    select: ROLE_SLOT_SELECT,
  });
}

export async function removeRoleSlot(slotId: string, organizationId: string) {
  const slot = await prisma.templateRoleSlot.findUnique({
    where: { id: slotId },
    include: { template: true },
  });
  if (!slot) throw new NotFoundError('Role slot');
  if (slot.template.organizationId !== organizationId) throw new AuthorizationError('Not in your organization');
  await prisma.templateRoleSlot.delete({ where: { id: slotId } });
}

/**
 * Generate ServiceSchedule instances for every occurrence of a template's
 * dayOfWeek between startDate and endDate (inclusive).
 * Skips dates that already have a service from this template.
 * Returns { created, skipped }.
 */
export async function generateFromTemplate(templateId: string, organizationId: string, createdById: string, startDate: Date, endDate: Date) {
  const template = await prisma.serviceTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new NotFoundError('Template');
  if (template.organizationId !== organizationId) throw new AuthorizationError('Not in your organization');

  // Build list of matching dates
  const [hh, mm] = template.startTime.split(':').map(Number);
  const dates: Date[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(hh, mm, 0, 0);

  // Advance to first matching day
  while (cursor.getDay() !== template.dayOfWeek) {
    cursor.setDate(cursor.getDate() + 1);
  }

  while (cursor <= endDate) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }

  if (dates.length === 0) return { created: 0, skipped: 0 };

  // Find existing services for this template in the range to avoid duplicates
  const existing = await prisma.serviceSchedule.findMany({
    where: {
      templateId,
      serviceDate: { gte: startDate, lte: endDate },
    },
    select: { serviceDate: true },
  });

  const existingDates = new Set(
    existing.map((s) => s.serviceDate.toISOString().slice(0, 10))
  );

  const toCreate = dates.filter(
    (d) => !existingDates.has(d.toISOString().slice(0, 10))
  );

  if (toCreate.length > 0) {
    await prisma.serviceSchedule.createMany({
      data: toCreate.map((d) => ({
        organizationId,
        templateId,
        createdById,
        name: template.name,
        serviceDate: d,
        description: template.description,
      })),
    });
  }

  return { created: toCreate.length, skipped: dates.length - toCreate.length };
}

// ── Posts ────────────────────────────────────────────────────────────────────

export async function listPosts(organizationId: string) {
  return prisma.post.findMany({
    where: { organizationId },
    orderBy: [{ zone: 'asc' }, { name: 'asc' }],
  });
}

export async function createPost(organizationId: string, name: string, zone?: string, description?: string) {
  return prisma.post.create({
    data: { organizationId, name: name.trim(), zone: zone?.trim() || null, description: description?.trim() || null },
  });
}

export async function deletePost(postId: string, organizationId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new NotFoundError('Post');
  if (post.organizationId !== organizationId) throw new AuthorizationError('Post not in your organization');
  await prisma.post.delete({ where: { id: postId } });
}

// ── Services ─────────────────────────────────────────────────────────────────

export async function listServices(organizationId: string, opts: {
  from?: Date;
  to?: Date;
  limit?: number;
}) {
  const { from, to, limit = 20 } = opts;
  return prisma.serviceSchedule.findMany({
    where: {
      organizationId,
      ...(from || to ? {
        serviceDate: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      } : {}),
    },
    select: SERVICE_SELECT,
    orderBy: { serviceDate: 'asc' },
    take: limit,
  });
}

export async function getTodayServices(organizationId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return listServices(organizationId, { from: start, to: end, limit: 10 });
}

export async function getService(serviceId: string, organizationId: string) {
  const service = await prisma.serviceSchedule.findUnique({
    where: { id: serviceId },
    select: SERVICE_SELECT,
  });
  if (!service) throw new NotFoundError('Service');
  if (service.organizationId !== organizationId) throw new AuthorizationError('Service not in your organization');
  return service;
}

export async function createService(params: {
  organizationId: string;
  createdById: string;
  name: string;
  serviceDate: Date;
  description?: string;
}) {
  return prisma.serviceSchedule.create({
    data: {
      organizationId: params.organizationId,
      createdById: params.createdById,
      name: params.name.trim(),
      serviceDate: params.serviceDate,
      description: params.description?.trim() || null,
    },
    select: SERVICE_SELECT,
  });
}

export async function updateService(serviceId: string, organizationId: string, data: {
  name?: string;
  serviceDate?: Date;
  description?: string;
}) {
  const existing = await prisma.serviceSchedule.findUnique({ where: { id: serviceId } });
  if (!existing) throw new NotFoundError('Service');
  if (existing.organizationId !== organizationId) throw new AuthorizationError('Service not in your organization');

  return prisma.serviceSchedule.update({
    where: { id: serviceId },
    data: {
      ...(data.name ? { name: data.name.trim() } : {}),
      ...(data.serviceDate ? { serviceDate: data.serviceDate } : {}),
      ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
    },
    select: SERVICE_SELECT,
  });
}

export async function deleteService(serviceId: string, organizationId: string) {
  const existing = await prisma.serviceSchedule.findUnique({ where: { id: serviceId } });
  if (!existing) throw new NotFoundError('Service');
  if (existing.organizationId !== organizationId) throw new AuthorizationError('Service not in your organization');
  await prisma.serviceSchedule.delete({ where: { id: serviceId } });
}

// ── Assignments ───────────────────────────────────────────────────────────────

export async function assignUser(params: {
  serviceId: string;
  organizationId: string;
  targetUserId: string;
  postId?: string;
  role?: string;
  notes?: string;
}) {
  // Verify service belongs to org
  const service = await prisma.serviceSchedule.findUnique({ where: { id: params.serviceId } });
  if (!service) throw new NotFoundError('Service');
  if (service.organizationId !== params.organizationId) throw new AuthorizationError('Service not in your organization');

  // Verify user belongs to org
  const user = await prisma.user.findUnique({ where: { id: params.targetUserId } });
  if (!user || user.organizationId !== params.organizationId) throw new ValidationError('User not in your organization');

  const assignment = await prisma.shiftAssignment.upsert({
    where: { serviceId_userId: { serviceId: params.serviceId, userId: params.targetUserId } },
    create: {
      serviceId: params.serviceId,
      userId: params.targetUserId,
      postId: params.postId || null,
      role: params.role?.trim() || null,
      notes: params.notes?.trim() || null,
    },
    update: {
      postId: params.postId || null,
      role: params.role?.trim() || null,
      notes: params.notes?.trim() || null,
    },
    select: ASSIGNMENT_SELECT,
  });

  // Send push notification to assigned user
  if (user.pushToken) {
    sendPushNotification(user.pushToken, {
      title: 'You have been scheduled',
      body: `You've been assigned to ${service.name} on ${service.serviceDate.toLocaleDateString()}${params.role ? ` as ${params.role}` : ''}`,
      data: { type: 'assignment', serviceId: params.serviceId, assignmentId: assignment.id },
    }).catch(() => null);
  }

  return assignment;
}

export async function removeAssignment(assignmentId: string, organizationId: string) {
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: { service: true },
  });
  if (!assignment) throw new NotFoundError('Assignment');
  if (assignment.service.organizationId !== organizationId) throw new AuthorizationError('Not in your organization');
  await prisma.shiftAssignment.delete({ where: { id: assignmentId } });
}

export async function getMyAssignment(serviceId: string, userId: string) {
  return prisma.shiftAssignment.findUnique({
    where: { serviceId_userId: { serviceId, userId } },
    select: ASSIGNMENT_SELECT,
  });
}

// ── Check-in / Check-out ──────────────────────────────────────────────────────

export async function checkIn(assignmentId: string, userId: string, organizationId: string) {
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: { service: true },
  });
  if (!assignment) throw new NotFoundError('Assignment');
  if (assignment.userId !== userId) throw new AuthorizationError('Not your assignment');
  if (assignment.service.organizationId !== organizationId) throw new AuthorizationError('Not in your organization');

  await prisma.checkIn.upsert({
    where: { assignmentId },
    create: { assignmentId },
    update: { checkedInAt: new Date(), checkedOutAt: null },
  });

  return prisma.shiftAssignment.findUnique({ where: { id: assignmentId }, select: ASSIGNMENT_SELECT });
}

export async function checkOut(assignmentId: string, userId: string, organizationId: string) {
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: { service: true, checkIn: true },
  });
  if (!assignment) throw new NotFoundError('Assignment');
  if (assignment.userId !== userId) throw new AuthorizationError('Not your assignment');
  if (assignment.service.organizationId !== organizationId) throw new AuthorizationError('Not in your organization');
  if (!assignment.checkIn) throw new ValidationError('You have not checked in yet');

  await prisma.checkIn.update({
    where: { assignmentId },
    data: { checkedOutAt: new Date() },
  });

  return prisma.shiftAssignment.findUnique({ where: { id: assignmentId }, select: ASSIGNMENT_SELECT });
}

// ── Swap Requests ─────────────────────────────────────────────────────────────

export async function requestSwap(params: {
  fromAssignmentId: string;
  userId: string;
  organizationId: string;
  toUserId: string;
  message?: string;
}) {
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: params.fromAssignmentId },
    include: { service: true },
  });
  if (!assignment) throw new NotFoundError('Assignment');
  if (assignment.userId !== params.userId) throw new AuthorizationError('Not your assignment');
  if (assignment.service.organizationId !== params.organizationId) throw new AuthorizationError('Not in your organization');

  const toUser = await prisma.user.findUnique({ where: { id: params.toUserId } });
  if (!toUser || toUser.organizationId !== params.organizationId) throw new ValidationError('Target user not in your organization');

  // Cancel any existing pending swap for this assignment
  await prisma.shiftSwapRequest.deleteMany({
    where: { fromAssignmentId: params.fromAssignmentId, status: 'PENDING' },
  });

  return prisma.shiftSwapRequest.create({
    data: {
      fromAssignmentId: params.fromAssignmentId,
      toUserId: params.toUserId,
      message: params.message?.trim() || null,
    },
    include: {
      fromAssignment: {
        include: {
          service: { select: { id: true, name: true, serviceDate: true } },
          post: { select: { id: true, name: true, zone: true } },
          user: { select: { id: true, displayName: true } },
        },
      },
      toUser: { select: { id: true, displayName: true } },
    },
  });
}

export async function respondToSwap(swapId: string, userId: string, organizationId: string, accept: boolean) {
  const swap = await prisma.shiftSwapRequest.findUnique({
    where: { id: swapId },
    include: {
      fromAssignment: { include: { service: true } },
    },
  });
  if (!swap) throw new NotFoundError('Swap request');
  if (swap.toUserId !== userId) throw new AuthorizationError('Not your swap request');
  if (swap.fromAssignment.service.organizationId !== organizationId) throw new AuthorizationError('Not in your organization');
  if (swap.status !== 'PENDING') throw new ValidationError('Swap request already responded to');

  const newStatus = accept ? 'ACCEPTED' : 'DECLINED';

  await prisma.shiftSwapRequest.update({
    where: { id: swapId },
    data: { status: newStatus, respondedAt: new Date() },
  });

  // If accepted, reassign the shift
  if (accept) {
    await prisma.shiftAssignment.update({
      where: { id: swap.fromAssignmentId },
      data: { userId: swap.toUserId },
    });
  }

  return prisma.shiftSwapRequest.findUnique({
    where: { id: swapId },
    include: {
      fromAssignment: {
        include: {
          service: { select: { id: true, name: true, serviceDate: true } },
          post: { select: { id: true, name: true, zone: true } },
          user: { select: { id: true, displayName: true } },
        },
      },
      toUser: { select: { id: true, displayName: true } },
    },
  });
}

export async function listSwapRequests(userId: string, organizationId: string) {
  return prisma.shiftSwapRequest.findMany({
    where: {
      OR: [
        { toUserId: userId },
        { fromAssignment: { userId } },
      ],
      fromAssignment: { service: { organizationId } },
    },
    include: {
      fromAssignment: {
        include: {
          service: { select: { id: true, name: true, serviceDate: true } },
          post: { select: { id: true, name: true, zone: true } },
          user: { select: { id: true, displayName: true } },
        },
      },
      toUser: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
