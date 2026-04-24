import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { PLAN_LIMITS, PlanLimits } from '../config/subscriptions';
import { AuthorizationError } from '../utils/errors';

async function getOrgSubscription(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      subscriptionTier: true,
      subscriptionStatus: true,
    },
  });

  if (!org) {
    throw new AuthorizationError('Organization not found');
  }

  return org;
}

function isSubscriptionActive(org: { subscriptionStatus: string }): boolean {
  return org.subscriptionStatus === 'ACTIVE';
}

/**
 * Middleware factory that checks if the org's plan includes a specific feature.
 */
export function requireFeature(feature: keyof PlanLimits['features']) {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const org = await getOrgSubscription(request.organizationId);

    if (!isSubscriptionActive(org)) {
      throw new AuthorizationError(
        'Your subscription has expired. Please upgrade to continue.',
      );
    }

    const limits = PLAN_LIMITS[org.subscriptionTier];
    if (!limits.features[feature]) {
      throw new AuthorizationError(
        `The ${feature} feature requires a higher plan. Please upgrade.`,
      );
    }
  };
}

/**
 * Middleware that checks group creation limits before allowing group creation.
 * Enforces separate limits for LEAD groups and SUB groups based on the plan.
 */
export async function checkGroupLimit(request: FastifyRequest, _reply: FastifyReply) {
  const org = await getOrgSubscription(request.organizationId);

  if (!isSubscriptionActive(org)) {
    throw new AuthorizationError(
      'Your subscription has expired. Please upgrade to continue.',
    );
  }

  const limits = PLAN_LIMITS[org.subscriptionTier];
  const body = request.body as { type?: string } | undefined;
  const groupType = body?.type?.toUpperCase();

  if (groupType === 'SUB') {
    if (limits.maxSubGroups === -1) return; // unlimited

    const subGroupCount = await prisma.group.count({
      where: { organizationId: request.organizationId, type: 'SUB' },
    });

    if (subGroupCount >= limits.maxSubGroups) {
      throw new AuthorizationError(
        `Sub-group limit reached (${limits.maxSubGroups}). Upgrade your plan to create more sub-groups.`,
      );
    }
  } else {
    // LEAD group
    if (limits.maxLeadGroups === -1) return; // unlimited

    const leadGroupCount = await prisma.group.count({
      where: { organizationId: request.organizationId, type: 'LEAD' },
    });

    if (leadGroupCount >= limits.maxLeadGroups) {
      throw new AuthorizationError(
        `Lead group limit reached (${limits.maxLeadGroups}). Upgrade your plan to create more groups.`,
      );
    }
  }
}

/**
 * Middleware that checks member limit before allowing new user registration.
 */
export async function checkMemberLimit(request: FastifyRequest, _reply: FastifyReply) {
  // Registration provides the org code in the body; we need to resolve the org
  const body = request.body as { organizationCode?: string } | undefined;
  if (!body?.organizationCode) return; // Let the controller handle validation

  const org = await prisma.organization.findFirst({
    where: { inviteCode: { equals: body.organizationCode, mode: 'insensitive' } },
    select: {
      id: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      pcoIntegrationEnabled: true,
    },
  });

  if (!org) return; // Let the controller handle the 404

  // Planning Center add-on overrides member cap to unlimited
  if (org.pcoIntegrationEnabled) return;

  const limits = PLAN_LIMITS[org.subscriptionTier];
  if (limits.maxMembers === -1) return; // unlimited

  const memberCount = await prisma.user.count({
    where: { organizationId: org.id },
  });

  if (memberCount >= limits.maxMembers) {
    throw new AuthorizationError(
      `This organization has reached its member limit (${limits.maxMembers}). The organization admin needs to upgrade the plan.`,
    );
  }
}
