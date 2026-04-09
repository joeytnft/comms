import { prisma } from '../../config/database';
import { AuthorizationError, NotFoundError, ValidationError } from '../../utils/errors';

interface CreateGroupInput {
  name: string;
  description?: string;
  type: 'LEAD' | 'SUB';
  parentGroupId?: string;
  iconColor?: string;
}

/**
 * Returns all groups a user can see within their organization.
 * - Groups they are a direct member of
 * - If they are in a LEAD group, they also see all its SUB groups
 */
export async function getGroupsForUser(userId: string, organizationId: string) {
  // Get groups the user is a direct member of (with their role)
  const memberships = await prisma.groupMembership.findMany({
    where: { userId },
    select: { groupId: true, role: true },
  });

  const membershipMap = new Map(memberships.map((m) => [m.groupId, m.role]));
  const directGroupIds = memberships.map((m) => m.groupId);

  // Find LEAD groups the user is in — they can see all SUB groups under them
  const leadGroups = await prisma.group.findMany({
    where: {
      id: { in: directGroupIds },
      type: 'LEAD',
      organizationId,
    },
    select: { id: true },
  });

  const leadGroupIds = leadGroups.map((g) => g.id);

  // Get SUB groups under those LEAD groups
  const subGroups = leadGroupIds.length > 0
    ? await prisma.group.findMany({
        where: {
          parentGroupId: { in: leadGroupIds },
          organizationId,
        },
        select: { id: true },
      })
    : [];

  const subGroupIds = subGroups.map((g) => g.id);

  // Combine all visible group IDs (deduplicated)
  const visibleGroupIds = [...new Set([...directGroupIds, ...subGroupIds])];

  const groups = await prisma.group.findMany({
    where: {
      id: { in: visibleGroupIds },
      organizationId,
    },
    include: {
      _count: { select: { memberships: true } },
      memberships: {
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true, lastSeenAt: true } },
        },
      },
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }], // LEAD first, then SUB
  });

  // Attach the user's role for groups they are a direct member of
  return groups.map((g) => ({
    ...g,
    myRole: membershipMap.get(g.id)?.toLowerCase() ?? null,
  }));
}

/**
 * Returns the full group hierarchy for an organization.
 * Each lead group with its sub-groups.
 */
export async function getGroupHierarchy(organizationId: string) {
  const leadGroups = await prisma.group.findMany({
    where: { organizationId, type: 'LEAD' },
    include: {
      subGroups: {
        include: {
          _count: { select: { memberships: true } },
        },
        orderBy: { name: 'asc' },
      },
      _count: { select: { memberships: true } },
    },
    orderBy: { name: 'asc' },
  });

  return leadGroups.map((lead) => ({
    leadGroup: {
      ...lead,
      memberCount: lead._count.memberships,
      subGroups: undefined,
      _count: undefined,
    },
    subGroups: lead.subGroups.map((sub) => ({
      ...sub,
      memberCount: sub._count.memberships,
      _count: undefined,
    })),
  }));
}

/**
 * Checks whether a user can access a specific group.
 * A user can access a group if:
 * - They are a direct member
 * - They are a member of the parent LEAD group (for SUB groups)
 */
export async function canUserAccessGroup(userId: string, groupId: string) {
  // Check direct membership
  const directMembership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });

  if (directMembership) return true;

  // Check if the group is a SUB group and user is in its parent LEAD group
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { parentGroupId: true },
  });

  if (group?.parentGroupId) {
    const parentMembership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.parentGroupId, userId } },
    });
    return !!parentMembership;
  }

  return false;
}

/**
 * Returns the user's role in a group, or null if not a member.
 */
export async function getUserRole(userId: string, groupId: string) {
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

/**
 * Validates group creation data.
 */
export async function validateGroupCreation(
  data: CreateGroupInput,
  organizationId: string,
  creatorId: string,
) {
  if (!data.name || data.name.trim().length === 0) {
    throw new ValidationError('Group name is required');
  }

  if (data.type === 'LEAD') {
    if (data.parentGroupId) {
      throw new ValidationError('LEAD groups cannot have a parent group');
    }
  } else if (data.type === 'SUB') {
    if (!data.parentGroupId) {
      throw new ValidationError('SUB groups must have a parent LEAD group');
    }

    // Verify parent exists and is a LEAD group in the same org
    const parentGroup = await prisma.group.findFirst({
      where: {
        id: data.parentGroupId,
        organizationId,
        type: 'LEAD',
      },
    });

    if (!parentGroup) {
      throw new NotFoundError('Parent LEAD group');
    }

    // Creator must be ADMIN of the parent group
    const creatorRole = await getUserRole(creatorId, data.parentGroupId);
    if (creatorRole !== 'ADMIN') {
      throw new AuthorizationError('Only admins of the parent group can create sub-groups');
    }
  } else {
    throw new ValidationError('Group type must be LEAD or SUB');
  }
}

/**
 * Validates that a member can be added to a group.
 */
export async function validateMemberAddition(
  groupId: string,
  targetUserId: string,
  requesterId: string,
  organizationId: string,
) {
  // Requester must be ADMIN
  const requesterRole = await getUserRole(requesterId, groupId);
  if (requesterRole !== 'ADMIN') {
    throw new AuthorizationError('Only group admins can add members');
  }

  // Target user must be in the same organization
  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, organizationId },
  });
  if (!targetUser) {
    throw new NotFoundError('User in this organization');
  }

  // Check not already a member
  const existingMembership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });
  if (existingMembership) {
    throw new ValidationError('User is already a member of this group');
  }
}
