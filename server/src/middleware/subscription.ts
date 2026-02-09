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
      trialEndsAt: true,
    },
  });

  if (!org) {
    throw new AuthorizationError('Organization not found');
  }

  return org;
}

function isSubscriptionActive(org: {
  subscriptionStatus: string;
  trialEndsAt: Date | null;
}): boolean {
  if (org.subscriptionStatus === 'ACTIVE') return true;
  if (
    org.subscriptionStatus === 'TRIALING' &&
    org.trialEndsAt &&
    org.trialEndsAt > new Date()
  ) {
    return true;
  }
  return false;
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
 * Middleware that checks group creation limit before allowing group creation.
 */
export async function checkGroupLimit(request: FastifyRequest, _reply: FastifyReply) {
  const org = await getOrgSubscription(request.organizationId);

  if (!isSubscriptionActive(org)) {
    throw new AuthorizationError(
      'Your subscription has expired. Please upgrade to continue.',
    );
  }

  const limits = PLAN_LIMITS[org.subscriptionTier];
  if (limits.maxGroups === -1) return; // unlimited

  const groupCount = await prisma.group.count({
    where: { organizationId: request.organizationId },
  });

  if (groupCount >= limits.maxGroups) {
    throw new AuthorizationError(
      `Group limit reached (${limits.maxGroups}). Upgrade your plan to create more groups.`,
    );
  }
}

/**
 * Middleware that checks member limit before allowing new user registration.
 */
export async function checkMemberLimit(request: FastifyRequest, _reply: FastifyReply) {
  // Registration provides the org code in the body; we need to resolve the org
  const body = request.body as { organizationCode?: string } | undefined;
  if (!body?.organizationCode) return; // Let the controller handle validation

  const org = await prisma.organization.findUnique({
    where: { inviteCode: body.organizationCode },
    select: {
      id: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      trialEndsAt: true,
    },
  });

  if (!org) return; // Let the controller handle the 404

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
