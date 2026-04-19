import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { ValidationError, AuthorizationError, NotFoundError } from '../utils/errors';

async function requireAdmin(request: FastifyRequest) {
  const isOrgAdmin = await prisma.user.findFirst({
    where: { id: request.userId, isOrgAdmin: true },
  });
  if (!isOrgAdmin) {
    const membership = await prisma.groupMembership.findFirst({
      where: { userId: request.userId, role: 'ADMIN', group: { organizationId: request.organizationId } },
    });
    if (!membership) throw new AuthorizationError('Admin access required');
  }
}

// ── Qualification Types ───────────────────────────────────────────────────────

export async function listQualificationTypes(request: FastifyRequest, reply: FastifyReply) {
  const types = await prisma.qualificationType.findMany({
    where: { organizationId: request.organizationId, isActive: true },
    orderBy: { name: 'asc' },
  });
  reply.send({ qualificationTypes: types });
}

export async function createQualificationType(
  request: FastifyRequest<{
    Body: { name: string; description?: string; validityDays?: number };
  }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const { name, description, validityDays } = request.body;
  if (!name?.trim()) throw new ValidationError('name is required');

  const existing = await prisma.qualificationType.findUnique({
    where: { organizationId_name: { organizationId: request.organizationId, name: name.trim() } },
  });
  if (existing) throw new ValidationError('A qualification type with this name already exists');

  const qualType = await prisma.qualificationType.create({
    data: {
      organizationId: request.organizationId,
      name: name.trim(),
      description: description?.trim(),
      validityDays: validityDays ?? 0,
      createdBy: request.userId,
    },
  });

  reply.status(201).send({ qualificationType: qualType });
}

export async function updateQualificationType(
  request: FastifyRequest<{
    Params: { id: string };
    Body: { name?: string; description?: string; validityDays?: number; isActive?: boolean };
  }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const existing = await prisma.qualificationType.findFirst({
    where: { id: request.params.id, organizationId: request.organizationId },
  });
  if (!existing) throw new NotFoundError('Qualification type not found');

  const qualType = await prisma.qualificationType.update({
    where: { id: existing.id },
    data: {
      ...(request.body.name ? { name: request.body.name.trim() } : {}),
      ...(request.body.description !== undefined ? { description: request.body.description?.trim() } : {}),
      ...(request.body.validityDays !== undefined ? { validityDays: request.body.validityDays } : {}),
      ...(request.body.isActive !== undefined ? { isActive: request.body.isActive } : {}),
    },
  });

  reply.send({ qualificationType: qualType });
}

export async function deleteQualificationType(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const existing = await prisma.qualificationType.findFirst({
    where: { id: request.params.id, organizationId: request.organizationId },
  });
  if (!existing) throw new NotFoundError('Qualification type not found');
  // Soft-delete to preserve history
  await prisma.qualificationType.update({ where: { id: existing.id }, data: { isActive: false } });
  reply.status(204).send();
}

// ── Member Qualifications ─────────────────────────────────────────────────────

export async function getMemberQualifications(
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) {
  // Members can view their own; admins can view anyone's
  const isSelf = request.params.userId === request.userId;
  if (!isSelf) await requireAdmin(request);

  const targetUser = await prisma.user.findFirst({
    where: { id: request.params.userId, organizationId: request.organizationId },
    select: { id: true, displayName: true, avatarUrl: true },
  });
  if (!targetUser) throw new NotFoundError('User not found');

  const qualifications = await prisma.memberQualification.findMany({
    where: { userId: request.params.userId },
    include: { qualificationType: true },
    orderBy: { qualificationType: { name: 'asc' } },
  });

  reply.send({ user: targetUser, qualifications });
}

export async function awardQualification(
  request: FastifyRequest<{
    Params: { userId: string };
    Body: { qualificationTypeId: string; earnedDate: string; notes?: string };
  }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const { qualificationTypeId, earnedDate, notes } = request.body;

  if (!qualificationTypeId) throw new ValidationError('qualificationTypeId is required');
  if (!earnedDate) throw new ValidationError('earnedDate is required');

  const targetUser = await prisma.user.findFirst({
    where: { id: request.params.userId, organizationId: request.organizationId },
  });
  if (!targetUser) throw new NotFoundError('User not found');

  const qualType = await prisma.qualificationType.findFirst({
    where: { id: qualificationTypeId, organizationId: request.organizationId, isActive: true },
  });
  if (!qualType) throw new NotFoundError('Qualification type not found');

  const earned = new Date(earnedDate);
  const expiresAt =
    qualType.validityDays > 0
      ? new Date(earned.getTime() + qualType.validityDays * 24 * 60 * 60 * 1000)
      : null;

  const qualification = await prisma.memberQualification.upsert({
    where: {
      userId_qualificationTypeId: {
        userId: request.params.userId,
        qualificationTypeId,
      },
    },
    create: {
      userId: request.params.userId,
      qualificationTypeId,
      earnedDate: earned,
      expiresAt,
      notes: notes?.trim(),
      awardedBy: request.userId,
    },
    update: {
      earnedDate: earned,
      expiresAt,
      notes: notes?.trim(),
      awardedBy: request.userId,
    },
    include: { qualificationType: true },
  });

  reply.status(201).send({ qualification });
}

export async function revokeQualification(
  request: FastifyRequest<{ Params: { userId: string; qualificationTypeId: string } }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const existing = await prisma.memberQualification.findUnique({
    where: {
      userId_qualificationTypeId: {
        userId: request.params.userId,
        qualificationTypeId: request.params.qualificationTypeId,
      },
    },
  });
  if (!existing) throw new NotFoundError('Qualification not found');

  await prisma.memberQualification.delete({ where: { id: existing.id } });
  reply.status(204).send();
}

// ── Org-wide qualification summary (admin) ────────────────────────────────────

export async function getQualificationsSummary(request: FastifyRequest, reply: FastifyReply) {
  await requireAdmin(request);

  const members = await prisma.user.findMany({
    where: { organizationId: request.organizationId },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      memberQualifications: {
        include: { qualificationType: true },
      },
    },
    orderBy: { displayName: 'asc' },
  });

  reply.send({ members });
}
