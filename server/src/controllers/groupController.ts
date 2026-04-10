import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../config/database';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import * as hierarchyService from '../services/groups/hierarchyService';

interface CreateGroupBody {
  name: string;
  description?: string;
  type: string; // Accepts 'lead'/'sub' or 'LEAD'/'SUB' — normalized to uppercase
  parentGroupId?: string;
  iconColor?: string;
}

interface UpdateGroupBody {
  name?: string;
  description?: string;
  iconColor?: string;
  alertsEnabled?: boolean;
}

interface AddMemberBody {
  userId?: string;
  email?: string;
  role?: 'ADMIN' | 'MEMBER';
}

interface GroupIdParams {
  id: string;
}

interface RemoveMemberParams {
  id: string;
  userId: string;
}

interface JoinByInviteBody {
  inviteCode: string;
}

/**
 * Normalizes a group object for API responses, converting Prisma enum
 * values (LEAD/SUB) to the lowercase format the client expects (lead/sub).
 */
function formatGroupType(type: string): string {
  return type.toLowerCase();
}

const GROUP_SELECT = {
  id: true,
  name: true,
  description: true,
  type: true,
  organizationId: true,
  campusId: true,
  parentGroupId: true,
  iconColor: true,
  inviteCode: true,
  alertsEnabled: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

function formatMemberRole(role: string): string {
  return role.toLowerCase();
}

function formatMembership(m: { role: string; [key: string]: unknown }) {
  return { ...m, role: formatMemberRole(m.role) };
}

function generateInviteCode(): string {
  // 8-char alphanumeric code, e.g. "A3K9X2M7"
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function findGroupInOrg(groupId: string, organizationId: string) {
  const group = await prisma.group.findFirst({
    where: { id: groupId, organizationId },
  });
  if (!group) {
    throw new NotFoundError('Group');
  }
  return group;
}

export async function listGroups(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  let groups = await hierarchyService.getGroupsForUser(
    request.userId,
    request.organizationId,
  );

  // Campus-scoped users only see their campus groups
  if (request.campusId) {
    groups = groups.filter((g) => !g.campusId || g.campusId === request.campusId);
  }

  const formatted = groups.map((g) => ({
    ...g,
    type: formatGroupType(g.type),
    memberCount: g._count.memberships,
    members: (g as { memberships?: { role: string; user: object }[] }).memberships?.map(formatMembership) ?? [],
    memberships: undefined,
    _count: undefined,
  }));

  reply.send({ groups: formatted });
}

export async function createGroup(
  request: FastifyRequest<{ Body: CreateGroupBody }>,
  reply: FastifyReply,
) {
  const { name, description, type: rawType, parentGroupId, iconColor } = request.body;
  const type = rawType.toUpperCase() as 'LEAD' | 'SUB';

  await hierarchyService.validateGroupCreation(
    { name, description, type, parentGroupId, iconColor },
    request.organizationId,
    request.userId,
  );

  const group = await prisma.group.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      type,
      organizationId: request.organizationId,
      campusId: request.campusId ?? null,
      parentGroupId: parentGroupId || null,
      iconColor: iconColor || null,
      createdBy: request.userId,
      memberships: {
        create: {
          userId: request.userId,
          role: 'ADMIN',
        },
      },
    },
    select: {
      ...GROUP_SELECT,
      memberships: {
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true, lastSeenAt: true },
          },
        },
      },
      _count: { select: { memberships: true } },
    },
  });

  reply.status(201).send({
    group: {
      ...group,
      type: formatGroupType(group.type),
      memberCount: group._count.memberships,
      members: group.memberships.map(formatMembership),
      _count: undefined,
      memberships: undefined,
    },
  });
}

export async function getGroup(
  request: FastifyRequest<{ Params: GroupIdParams }>,
  reply: FastifyReply,
) {
  await findGroupInOrg(request.params.id, request.organizationId);

  const hasAccess = await hierarchyService.canUserAccessGroup(
    request.userId,
    request.params.id,
  );
  if (!hasAccess) {
    throw new AuthorizationError('You do not have access to this group');
  }

  const group = await prisma.group.findUnique({
    where: { id: request.params.id },
    select: {
      ...GROUP_SELECT,
      memberships: {
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true, lastSeenAt: true },
          },
        },
        orderBy: { joinedAt: 'asc' },
      },
      _count: { select: { memberships: true } },
    },
  });

  reply.send({
    group: {
      ...group,
      type: formatGroupType(group!.type),
      memberCount: group!._count.memberships,
      members: group!.memberships.map(formatMembership),
      _count: undefined,
      memberships: undefined,
    },
  });
}

export async function updateGroup(
  request: FastifyRequest<{ Params: GroupIdParams; Body: UpdateGroupBody }>,
  reply: FastifyReply,
) {
  await findGroupInOrg(request.params.id, request.organizationId);

  const role = await hierarchyService.getUserRole(request.userId, request.params.id);
  if (role !== 'ADMIN') {
    throw new AuthorizationError('Only group admins can update the group');
  }

  const { name, description, iconColor, alertsEnabled } = request.body;
  if (!name && description === undefined && iconColor === undefined && alertsEnabled === undefined) {
    throw new ValidationError('At least one field must be provided');
  }

  const data: Record<string, string | boolean | null> = {};
  if (name) data.name = name.trim();
  if (description !== undefined) data.description = description?.trim() || null;
  if (iconColor !== undefined) data.iconColor = iconColor || null;
  if (alertsEnabled !== undefined) data.alertsEnabled = alertsEnabled;

  const group = await prisma.group.update({
    where: { id: request.params.id },
    data,
    select: {
      ...GROUP_SELECT,
      _count: { select: { memberships: true } },
    },
  });

  reply.send({
    group: {
      ...group,
      type: formatGroupType(group.type),
      memberCount: group._count.memberships,
      _count: undefined,
    },
  });
}

export async function deleteGroup(
  request: FastifyRequest<{ Params: GroupIdParams }>,
  reply: FastifyReply,
) {
  const group = await findGroupInOrg(request.params.id, request.organizationId);

  const role = await hierarchyService.getUserRole(request.userId, request.params.id);
  if (role !== 'ADMIN') {
    throw new AuthorizationError('Only group admins can delete the group');
  }

  // Prevent deleting a LEAD group that still has SUB groups
  if (group.type === 'LEAD') {
    const subGroupCount = await prisma.group.count({
      where: { parentGroupId: group.id },
    });
    if (subGroupCount > 0) {
      throw new ValidationError(
        'Cannot delete a lead group that still has sub-groups. Delete sub-groups first.',
      );
    }
  }

  await prisma.group.delete({ where: { id: request.params.id } });

  reply.status(204).send();
}

export async function getMembers(
  request: FastifyRequest<{ Params: GroupIdParams }>,
  reply: FastifyReply,
) {
  await findGroupInOrg(request.params.id, request.organizationId);

  const hasAccess = await hierarchyService.canUserAccessGroup(
    request.userId,
    request.params.id,
  );
  if (!hasAccess) {
    throw new AuthorizationError('You do not have access to this group');
  }

  const memberships = await prisma.groupMembership.findMany({
    where: { groupId: request.params.id },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true, lastSeenAt: true },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  reply.send({ members: memberships.map(formatMembership) });
}

export async function addMember(
  request: FastifyRequest<{ Params: GroupIdParams; Body: AddMemberBody }>,
  reply: FastifyReply,
) {
  await findGroupInOrg(request.params.id, request.organizationId);

  const { userId, email, role } = request.body;

  // Resolve user by email if userId not provided
  let targetUserId = userId;
  if (!targetUserId && email) {
    const user = await prisma.user.findFirst({
      where: { email, organizationId: request.organizationId },
    });
    if (!user) {
      throw new NotFoundError('User with that email in this organization');
    }
    targetUserId = user.id;
  }

  if (!targetUserId) {
    throw new ValidationError('Either userId or email must be provided');
  }

  await hierarchyService.validateMemberAddition(
    request.params.id,
    targetUserId,
    request.userId,
    request.organizationId,
  );

  const membership = await prisma.groupMembership.create({
    data: {
      groupId: request.params.id,
      userId: targetUserId,
      role: role || 'MEMBER',
    },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true, lastSeenAt: true },
      },
    },
  });

  reply.status(201).send({ member: formatMembership(membership) });
}

export async function removeMember(
  request: FastifyRequest<{ Params: RemoveMemberParams }>,
  reply: FastifyReply,
) {
  const { id: groupId, userId: targetUserId } = request.params;

  await findGroupInOrg(groupId, request.organizationId);

  // Allow self-removal or ADMIN removal
  const isSelfRemoval = targetUserId === request.userId;
  if (!isSelfRemoval) {
    const role = await hierarchyService.getUserRole(request.userId, groupId);
    if (role !== 'ADMIN') {
      throw new AuthorizationError('Only group admins can remove members');
    }
  }

  // Prevent removing the last ADMIN
  const targetMembership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });
  if (!targetMembership) {
    throw new NotFoundError('Group member');
  }

  if (targetMembership.role === 'ADMIN') {
    const adminCount = await prisma.groupMembership.count({
      where: { groupId, role: 'ADMIN' },
    });
    if (adminCount <= 1) {
      throw new ValidationError('Cannot remove the last admin from the group');
    }
  }

  await prisma.groupMembership.delete({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });

  reply.status(204).send();
}

export async function getHierarchy(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const hierarchy = await hierarchyService.getGroupHierarchy(request.organizationId);
  const formatted = hierarchy.map((h) => ({
    leadGroup: { ...h.leadGroup, type: formatGroupType(h.leadGroup.type) },
    subGroups: h.subGroups.map((s) => ({ ...s, type: formatGroupType(s.type) })),
  }));
  reply.send({ hierarchy: formatted });
}

// --- Group Invites ---

/**
 * Generate or regenerate an invite code for a group. Admin only.
 */
export async function generateInvite(
  request: FastifyRequest<{ Params: GroupIdParams }>,
  reply: FastifyReply,
) {
  await findGroupInOrg(request.params.id, request.organizationId);

  const role = await hierarchyService.getUserRole(request.userId, request.params.id);
  if (role !== 'ADMIN') {
    throw new AuthorizationError('Only group admins can generate invite codes');
  }

  // Generate a unique code (retry on collision)
  let code: string;
  let attempts = 0;
  do {
    code = generateInviteCode();
    const existing = await prisma.group.findUnique({ where: { inviteCode: code } });
    if (!existing) break;
    attempts++;
  } while (attempts < 5);

  const group = await prisma.group.update({
    where: { id: request.params.id },
    data: { inviteCode: code },
    select: { id: true, inviteCode: true },
  });

  reply.send({ inviteCode: group.inviteCode });
}

/**
 * Revoke (clear) a group's invite code. Admin only.
 */
export async function revokeInvite(
  request: FastifyRequest<{ Params: GroupIdParams }>,
  reply: FastifyReply,
) {
  await findGroupInOrg(request.params.id, request.organizationId);

  const role = await hierarchyService.getUserRole(request.userId, request.params.id);
  if (role !== 'ADMIN') {
    throw new AuthorizationError('Only group admins can revoke invite codes');
  }

  await prisma.group.update({
    where: { id: request.params.id },
    data: { inviteCode: null },
  });

  reply.status(204).send();
}

/**
 * Join a group using an invite code. Any authenticated org member can use this.
 */
export async function joinByInvite(
  request: FastifyRequest<{ Body: JoinByInviteBody }>,
  reply: FastifyReply,
) {
  const { inviteCode } = request.body;

  if (!inviteCode) {
    throw new ValidationError('inviteCode is required');
  }

  const group = await prisma.group.findUnique({
    where: { inviteCode },
    select: { id: true, name: true, organizationId: true },
  });

  if (!group) {
    throw new NotFoundError('Group with that invite code');
  }

  // User must be in the same organization
  if (group.organizationId !== request.organizationId) {
    throw new AuthorizationError('This invite code is for a different organization');
  }

  // Check if already a member
  const existing = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: request.userId } },
  });
  if (existing) {
    throw new ConflictError('You are already a member of this group');
  }

  const membership = await prisma.groupMembership.create({
    data: {
      groupId: group.id,
      userId: request.userId,
      role: 'MEMBER',
    },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true, lastSeenAt: true },
      },
      group: {
        select: { id: true, name: true, type: true },
      },
    },
  });

  reply.status(201).send({ membership: formatMembership(membership) });
}

export async function getGroupKey(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { id: groupId } = request.params;

  // Verify membership
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: request.userId } },
  });
  if (!membership) {
    throw new AuthorizationError('Not a member of this group');
  }

  let group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, groupKey: true },
  });
  if (!group) throw new NotFoundError('Group');

  // Generate and persist key if not yet set
  if (!group.groupKey) {
    const key = crypto.randomBytes(32).toString('hex');
    group = await prisma.group.update({
      where: { id: groupId },
      data: { groupKey: key },
      select: { id: true, groupKey: true },
    });
  }

  return reply.send({ groupKey: group.groupKey });
}

export async function updateMemberRole(
  request: FastifyRequest<{ Params: { id: string; userId: string }; Body: { role: 'admin' | 'member' } }>,
  reply: FastifyReply,
) {
  const { id: groupId, userId: targetUserId } = request.params;
  const { role } = request.body;
  if (!['admin', 'member'].includes(role)) throw new ValidationError('role must be admin or member');

  const callerRole = await hierarchyService.getUserRole(request.userId, groupId);
  if (callerRole !== 'ADMIN') throw new AuthorizationError('Only group admins can change member roles');

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });
  if (!membership) throw new NotFoundError('Member');

  const updated = await prisma.groupMembership.update({
    where: { groupId_userId: { groupId, userId: targetUserId } },
    data: { role: role.toUpperCase() as 'ADMIN' | 'MEMBER' },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true, lastSeenAt: true } } },
  });

  return reply.send({ membership: formatMembership(updated) });
}
