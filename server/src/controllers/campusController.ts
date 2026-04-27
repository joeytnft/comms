import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { AuthorizationError, NotFoundError, ValidationError, ConflictError } from '../utils/errors';

interface CreateBody {
  name: string;
  description?: string;
  address?: string;
}

interface UpdateBody {
  name?: string;
  description?: string;
  address?: string;
}

interface CampusParams {
  id: string;
}

interface AssignUserBody {
  userId: string;
}

interface RemoveUserParams {
  id: string;
  userId: string;
}

const CAMPUS_SELECT = {
  id: true,
  name: true,
  description: true,
  address: true,
  inviteCode: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { campusMemberships: true, groups: true } },
};

function assertOrgCampus(campus: { organizationId: string } | null, organizationId: string) {
  if (!campus) throw new NotFoundError('Campus');
  if (campus.organizationId !== organizationId) throw new NotFoundError('Campus');
}

export async function listCampuses(request: FastifyRequest, reply: FastifyReply) {
  const campuses = await prisma.campus.findMany({
    where: { organizationId: request.organizationId },
    select: CAMPUS_SELECT,
    orderBy: { name: 'asc' },
  });
  reply.send({ campuses });
}

export async function createCampus(
  request: FastifyRequest<{ Body: CreateBody }>,
  reply: FastifyReply,
) {
  const { name, description, address } = request.body;
  if (!name?.trim()) throw new ValidationError('name is required');

  const existing = await prisma.campus.findUnique({
    where: { organizationId_name: { organizationId: request.organizationId, name: name.trim() } },
  });
  if (existing) throw new ConflictError('A campus with that name already exists');

  const campus = await prisma.campus.create({
    data: {
      organizationId: request.organizationId,
      name: name.trim(),
      description: description?.trim() || null,
      address: address?.trim() || null,
    },
    select: CAMPUS_SELECT,
  });

  reply.status(201).send({ campus });
}

export async function getCampus(
  request: FastifyRequest<{ Params: CampusParams }>,
  reply: FastifyReply,
) {
  const campus = await prisma.campus.findUnique({
    where: { id: request.params.id },
    select: { ...CAMPUS_SELECT, organizationId: true },
  });
  assertOrgCampus(campus, request.organizationId);
  reply.send({ campus });
}

export async function updateCampus(
  request: FastifyRequest<{ Params: CampusParams; Body: UpdateBody }>,
  reply: FastifyReply,
) {
  const existing = await prisma.campus.findUnique({
    where: { id: request.params.id },
    select: { organizationId: true },
  });
  assertOrgCampus(existing, request.organizationId);

  const { name, description, address } = request.body;
  const campus = await prisma.campus.update({
    where: { id: request.params.id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description.trim() || null }),
      ...(address !== undefined && { address: address.trim() || null }),
    },
    select: CAMPUS_SELECT,
  });
  reply.send({ campus });
}

export async function deleteCampus(
  request: FastifyRequest<{ Params: CampusParams }>,
  reply: FastifyReply,
) {
  const existing = await prisma.campus.findUnique({
    where: { id: request.params.id },
    select: { organizationId: true, _count: { select: { campusMemberships: true } } },
  });
  assertOrgCampus(existing, request.organizationId);

  if (existing!._count.campusMemberships > 0) {
    throw new AuthorizationError(
      'Cannot delete a campus that still has members. Reassign or remove all members first.',
    );
  }

  // Unlink groups and data from this campus before deleting
  await prisma.$transaction([
    prisma.group.updateMany({ where: { campusId: request.params.id }, data: { campusId: null } }),
    prisma.alert.updateMany({ where: { campusId: request.params.id }, data: { campusId: null } }),
    prisma.incident.updateMany({ where: { campusId: request.params.id }, data: { campusId: null } }),
    prisma.campus.delete({ where: { id: request.params.id } }),
  ]);

  reply.status(204).send();
}

export async function getCampusMembers(
  request: FastifyRequest<{ Params: CampusParams }>,
  reply: FastifyReply,
) {
  const existing = await prisma.campus.findUnique({
    where: { id: request.params.id },
    select: { organizationId: true },
  });
  assertOrgCampus(existing, request.organizationId);

  // Email and phone are PII; only org admins (and members of this campus
  // who are also org admins) get them. Standard members see name + avatar.
  const requester = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { isOrgAdmin: true },
  });
  const includeContact = requester?.isOrgAdmin === true;

  const memberships = await prisma.campusUser.findMany({
    where: { campusId: request.params.id },
    select: {
      joinedAt: true,
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          createdAt: true,
          ...(includeContact ? { email: true, phone: true } : {}),
        },
      },
    },
    orderBy: { user: { displayName: 'asc' } },
  });
  const members = memberships.map(m => ({ ...m.user, joinedAt: m.joinedAt }));
  reply.send({ members });
}

export async function assignUserToCampus(
  request: FastifyRequest<{ Params: CampusParams; Body: AssignUserBody }>,
  reply: FastifyReply,
) {
  const { userId } = request.body;
  if (!userId) throw new ValidationError('userId is required');

  const [campus, user] = await Promise.all([
    prisma.campus.findUnique({ where: { id: request.params.id }, select: { organizationId: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, organizationId: true, campusId: true } }),
  ]);

  assertOrgCampus(campus, request.organizationId);
  if (!user || user.organizationId !== request.organizationId) {
    throw new NotFoundError('User not found in this organization');
  }

  await prisma.$transaction([
    // Add to the junction table (upsert — idempotent)
    prisma.campusUser.upsert({
      where: { campusId_userId: { campusId: request.params.id, userId } },
      create: { campusId: request.params.id, userId },
      update: {},
    }),
    // Set as the user's active campus if they don't have one yet
    ...(user.campusId ? [] : [
      prisma.user.update({ where: { id: userId }, data: { campusId: request.params.id } }),
    ]),
  ]);

  reply.send({ ok: true });
}

export async function removeUserFromCampus(
  request: FastifyRequest<{ Params: RemoveUserParams }>,
  reply: FastifyReply,
) {
  const campus = await prisma.campus.findUnique({
    where: { id: request.params.id },
    select: { organizationId: true },
  });
  assertOrgCampus(campus, request.organizationId);

  const user = await prisma.user.findUnique({
    where: { id: request.params.userId },
    select: { id: true, organizationId: true, campusId: true },
  });

  if (!user || user.organizationId !== request.organizationId) {
    throw new NotFoundError('User not found in this organization');
  }

  const membership = await prisma.campusUser.findUnique({
    where: { campusId_userId: { campusId: request.params.id, userId: request.params.userId } },
  });
  if (!membership) {
    throw new AuthorizationError('User is not a member of this campus');
  }

  // Remove from junction table
  await prisma.campusUser.delete({ where: { id: membership.id } });

  // If this was the user's active campus, clear it (or switch to another membership)
  if (user.campusId === request.params.id) {
    const nextMembership = await prisma.campusUser.findFirst({
      where: { userId: request.params.userId },
      select: { campusId: true },
    });
    await prisma.user.update({
      where: { id: request.params.userId },
      data: { campusId: nextMembership?.campusId ?? null },
    });
  }

  reply.status(204).send();
}

export async function getOrgMembers(request: FastifyRequest, reply: FastifyReply) {
  // Returns all org members with all their campus memberships
  const members = await prisma.user.findMany({
    where: { organizationId: request.organizationId },
    select: {
      id: true, displayName: true, email: true, avatarUrl: true,
      campusId: true,
      campusMemberships: { select: { campusId: true, campus: { select: { id: true, name: true } } } },
    },
    orderBy: { displayName: 'asc' },
  });
  reply.send({ members });
}

export async function getMyMemberships(request: FastifyRequest, reply: FastifyReply) {
  const memberships = await prisma.campusUser.findMany({
    where: { userId: request.userId },
    select: {
      campus: { select: { id: true, name: true, address: true } },
    },
    orderBy: { campus: { name: 'asc' } },
  });
  reply.send({ campuses: memberships.map((m: { campus: { id: string; name: string; address: string | null } }) => m.campus) });
}
