import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { ValidationError, AuthorizationError, NotFoundError } from '../utils/errors';
import { sendTrainingSignupNotification } from '../services/notifications/pushService';

async function requireAdmin(request: FastifyRequest) {
  const membership = await prisma.groupMembership.findFirst({
    where: { userId: request.userId, role: 'ADMIN', group: { organizationId: request.organizationId } },
  });
  if (!membership && !(await prisma.user.findFirst({ where: { id: request.userId, isOrgAdmin: true } }))) {
    throw new AuthorizationError('Admin access required');
  }
}

// ── List trainings visible to the requesting user ─────────────────────────────

export async function listTrainings(request: FastifyRequest, reply: FastifyReply) {
  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { isOrgAdmin: true },
  });

  const userGroupIds = (
    await prisma.groupMembership.findMany({
      where: { userId: request.userId },
      select: { groupId: true },
    })
  ).map((m) => m.groupId);

  // Admins see all trainings; members see only ones targeting their groups
  const trainings = await prisma.trainingEvent.findMany({
    where: {
      organizationId: request.organizationId,
      isActive: true,
      ...(user?.isOrgAdmin
        ? {}
        : {
            OR: [
              { groupTargets: { some: { groupId: { in: userGroupIds } } } },
              { groupTargets: { none: {} } }, // no group targets = visible to all
            ],
          }),
    },
    include: {
      groupTargets: { include: { group: { select: { id: true, name: true, iconColor: true } } } },
      creator: { select: { id: true, displayName: true } },
      _count: { select: { signups: { where: { status: 'CONFIRMED' } } } },
    },
    orderBy: { startDate: 'asc' },
  });

  // Attach signup status for the requesting user
  const signupMap = new Map(
    (
      await prisma.trainingSignup.findMany({
        where: { userId: request.userId, trainingEventId: { in: trainings.map((t) => t.id) } },
      })
    ).map((s) => [s.trainingEventId, s]),
  );

  const result = trainings.map((t) => ({
    ...t,
    confirmedCount: t._count.signups,
    mySignup: signupMap.get(t.id) ?? null,
  }));

  reply.send({ trainings: result });
}

// ── Get single training ────────────────────────────────────────────────────────

export async function getTraining(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const training = await prisma.trainingEvent.findFirst({
    where: { id: request.params.id, organizationId: request.organizationId },
    include: {
      groupTargets: { include: { group: { select: { id: true, name: true, iconColor: true } } } },
      creator: { select: { id: true, displayName: true } },
      signups: {
        where: { status: 'CONFIRMED' },
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { signedUpAt: 'asc' },
      },
    },
  });

  if (!training) throw new NotFoundError('Training event not found');

  const mySignup = await prisma.trainingSignup.findUnique({
    where: { trainingEventId_userId: { trainingEventId: training.id, userId: request.userId } },
  });

  reply.send({ training: { ...training, mySignup } });
}

// ── Create training ────────────────────────────────────────────────────────────

export async function createTraining(
  request: FastifyRequest<{
    Body: {
      title: string;
      description?: string;
      location?: string;
      startDate: string;
      endDate?: string;
      maxAttendees?: number;
      groupIds?: string[];
    };
  }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const { title, description, location, startDate, endDate, maxAttendees, groupIds } = request.body;

  if (!title?.trim()) throw new ValidationError('title is required');
  if (!startDate) throw new ValidationError('startDate is required');

  // Validate group IDs belong to this org
  if (groupIds?.length) {
    const count = await prisma.group.count({
      where: { id: { in: groupIds }, organizationId: request.organizationId },
    });
    if (count !== groupIds.length) throw new ValidationError('One or more group IDs are invalid');
  }

  const training = await prisma.trainingEvent.create({
    data: {
      organizationId: request.organizationId,
      title: title.trim(),
      description: description?.trim(),
      location: location?.trim(),
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : undefined,
      maxAttendees: maxAttendees ?? null,
      createdBy: request.userId,
      groupTargets: groupIds?.length
        ? { create: groupIds.map((groupId) => ({ groupId })) }
        : undefined,
    },
    include: {
      groupTargets: { include: { group: { select: { id: true, name: true, iconColor: true } } } },
      creator: { select: { id: true, displayName: true } },
    },
  });

  reply.status(201).send({ training });
}

// ── Update training ────────────────────────────────────────────────────────────

export async function updateTraining(
  request: FastifyRequest<{
    Params: { id: string };
    Body: {
      title?: string;
      description?: string;
      location?: string;
      startDate?: string;
      endDate?: string;
      maxAttendees?: number | null;
      isActive?: boolean;
      groupIds?: string[];
    };
  }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const { groupIds, startDate, endDate, ...rest } = request.body;

  const existing = await prisma.trainingEvent.findFirst({
    where: { id: request.params.id, organizationId: request.organizationId },
  });
  if (!existing) throw new NotFoundError('Training event not found');

  // If groupIds provided, replace all targets
  if (groupIds !== undefined) {
    if (groupIds.length) {
      const count = await prisma.group.count({
        where: { id: { in: groupIds }, organizationId: request.organizationId },
      });
      if (count !== groupIds.length) throw new ValidationError('One or more group IDs are invalid');
    }
    await prisma.trainingGroupTarget.deleteMany({ where: { trainingEventId: existing.id } });
    if (groupIds.length) {
      await prisma.trainingGroupTarget.createMany({
        data: groupIds.map((groupId) => ({ trainingEventId: existing.id, groupId })),
      });
    }
  }

  const training = await prisma.trainingEvent.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(startDate ? { startDate: new Date(startDate) } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
    },
    include: {
      groupTargets: { include: { group: { select: { id: true, name: true, iconColor: true } } } },
      creator: { select: { id: true, displayName: true } },
    },
  });

  reply.send({ training });
}

// ── Delete training ────────────────────────────────────────────────────────────

export async function deleteTraining(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const existing = await prisma.trainingEvent.findFirst({
    where: { id: request.params.id, organizationId: request.organizationId },
  });
  if (!existing) throw new NotFoundError('Training event not found');
  await prisma.trainingEvent.delete({ where: { id: existing.id } });
  reply.status(204).send();
}

// ── Sign up for training ───────────────────────────────────────────────────────

export async function signUpForTraining(
  request: FastifyRequest<{ Params: { id: string }; Body: { notes?: string } }>,
  reply: FastifyReply,
) {
  const training = await prisma.trainingEvent.findFirst({
    where: { id: request.params.id, organizationId: request.organizationId, isActive: true },
    include: {
      _count: { select: { signups: { where: { status: 'CONFIRMED' } } } },
      groupTargets: true,
    },
  });
  if (!training) throw new NotFoundError('Training event not found');

  // Check group access
  if (training.groupTargets.length) {
    const inTargetGroup = await prisma.groupMembership.findFirst({
      where: { userId: request.userId, groupId: { in: training.groupTargets.map((t) => t.groupId) } },
    });
    const isAdmin = await prisma.user.findFirst({ where: { id: request.userId, isOrgAdmin: true } });
    if (!inTargetGroup && !isAdmin) throw new AuthorizationError('Not eligible for this training');
  }

  // Determine status (waitlisted if at capacity)
  const isFull =
    training.maxAttendees !== null && training._count.signups >= training.maxAttendees;
  const status = isFull ? 'WAITLISTED' : 'CONFIRMED';

  const signup = await prisma.trainingSignup.upsert({
    where: { trainingEventId_userId: { trainingEventId: training.id, userId: request.userId } },
    create: {
      trainingEventId: training.id,
      userId: request.userId,
      status,
      notes: request.body.notes,
    },
    update: { status, notes: request.body.notes },
    include: { user: { select: { id: true, displayName: true } } },
  });

  // Notify org admins of the signup
  if (status === 'CONFIRMED') {
    sendTrainingSignupNotification(
      request.organizationId,
      training.id,
      training.title,
      signup.user.displayName,
    ).catch(() => {}); // fire-and-forget
  }

  reply.status(201).send({ signup });
}

// ── Cancel signup ──────────────────────────────────────────────────────────────

export async function cancelSignup(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const signup = await prisma.trainingSignup.findUnique({
    where: { trainingEventId_userId: { trainingEventId: request.params.id, userId: request.userId } },
  });
  if (!signup) throw new NotFoundError('Signup not found');

  await prisma.trainingSignup.update({
    where: { id: signup.id },
    data: { status: 'CANCELLED' },
  });

  // Promote first waitlisted person if there is one
  const next = await prisma.trainingSignup.findFirst({
    where: { trainingEventId: request.params.id, status: 'WAITLISTED' },
    orderBy: { signedUpAt: 'asc' },
  });
  if (next) {
    await prisma.trainingSignup.update({ where: { id: next.id }, data: { status: 'CONFIRMED' } });
  }

  reply.status(204).send();
}

// ── Admin: list all signups ────────────────────────────────────────────────────

export async function listSignups(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const training = await prisma.trainingEvent.findFirst({
    where: { id: request.params.id, organizationId: request.organizationId },
  });
  if (!training) throw new NotFoundError('Training event not found');

  const signups = await prisma.trainingSignup.findMany({
    where: { trainingEventId: training.id },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true, email: true } } },
    orderBy: { signedUpAt: 'asc' },
  });

  reply.send({ signups });
}
