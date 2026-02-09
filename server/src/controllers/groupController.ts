import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import * as hierarchyService from '../services/groups/hierarchyService';

interface CreateGroupBody {
  name: string;
  description?: string;
  type: 'LEAD' | 'SUB';
  parentGroupId?: string;
  iconColor?: string;
}

interface UpdateGroupBody {
  name?: string;
  description?: string;
  iconColor?: string;
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

const GROUP_SELECT = {
  id: true,
  name: true,
  description: true,
  type: true,
  organizationId: true,
  parentGroupId: true,
  iconColor: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

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
  const groups = await hierarchyService.getGroupsForUser(
    request.userId,
    request.organizationId,
  );

  const formatted = groups.map((g) => ({
    ...g,
    memberCount: g._count.memberships,
    _count: undefined,
  }));

  reply.send({ groups: formatted });
}

export async function createGroup(
  request: FastifyRequest<{ Body: CreateGroupBody }>,
  reply: FastifyReply,
) {
  const { name, description, type, parentGroupId, iconColor } = request.body;

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
      memberCount: group._count.memberships,
      members: group.memberships,
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
      memberCount: group!._count.memberships,
      members: group!.memberships,
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

  const { name, description, iconColor } = request.body;
  if (!name && description === undefined && iconColor === undefined) {
    throw new ValidationError('At least one field must be provided');
  }

  const data: Record<string, string | null> = {};
  if (name) data.name = name.trim();
  if (description !== undefined) data.description = description?.trim() || null;
  if (iconColor !== undefined) data.iconColor = iconColor || null;

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

  reply.send({ members: memberships });
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

  reply.status(201).send({ member: membership });
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
  reply.send({ hierarchy });
}
