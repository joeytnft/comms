import { FastifyRequest, FastifyReply } from 'fastify';
import { SubscriptionTier, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { PLAN_LIMITS, PLANS } from '../config/subscriptions';
import { NotFoundError, ValidationError, AuthenticationError } from '../utils/errors';
import { env } from '../config/env';

export async function getSubscription(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const org = await prisma.organization.findUnique({
    where: { id: request.organizationId },
    select: {
      subscriptionTier: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      pcoIntegrationEnabled: true,
      _count: { select: { users: true } },
    },
  });

  if (!org) {
    throw new NotFoundError('Organization');
  }

  // Count lead and sub groups separately
  const [leadGroups, subGroups] = await Promise.all([
    prisma.group.count({
      where: { organizationId: request.organizationId, type: 'LEAD' },
    }),
    prisma.group.count({
      where: { organizationId: request.organizationId, type: 'SUB' },
    }),
  ]);

  const baseLimits = PLAN_LIMITS[org.subscriptionTier];
  // Planning Center add-on: override planningCenter feature flag and lift member cap to unlimited
  const limits = {
    ...baseLimits,
    maxMembers: org.pcoIntegrationEnabled ? -1 : baseLimits.maxMembers,
    features: {
      ...baseLimits.features,
      planningCenter: org.pcoIntegrationEnabled,
    },
  };

  reply.send({
    subscription: {
      tier: org.subscriptionTier,
      status: org.subscriptionStatus,
      limits,
      usage: {
        members: org._count.users,
        leadGroups,
        subGroups,
      },
    },
  });
}

export async function getPlans(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  reply.send({ plans: PLANS });
}

interface WebhookBody {
  event: {
    type: string;
    id: string;
    app_user_id: string;
    // RevenueCat webhook fields
    product_id?: string;
    entitlement_ids?: string[];
    expiration_at_ms?: number;
  };
  api_version: string;
}

/**
 * RevenueCat webhook handler.
 * RevenueCat sends events when subscription status changes.
 * We map RevenueCat entitlements to our tier system:
 *   - "pro"      entitlement → PRO tier      (pro_monthly product)
 *   - "team"     entitlement → TEAM tier     (team_monthly product)
 *   - "starter"  entitlement → STARTER tier  (starter_monthly product)
 *   - no active entitlement  → FREE tier
 */
export async function handleWebhook(
  request: FastifyRequest<{ Body: WebhookBody }>,
  reply: FastifyReply,
) {
  // Verify webhook authenticity via shared secret header
  const authHeader = request.headers.authorization;
  const webhookSecret = env.REVENUECAT_WEBHOOK_SECRET;

  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    throw new AuthenticationError('Invalid webhook signature');
  }

  const { event } = request.body;
  if (!event || !event.type || !event.app_user_id) {
    throw new ValidationError('Invalid webhook payload');
  }

  // Use event.id as idempotency key
  if (event.id) {
    const existing = await prisma.billingEvent.findUnique({
      where: { rcEventId: event.id },
    });
    if (existing) {
      // Already processed
      reply.status(200).send({ status: 'already_processed' });
      return;
    }
  }

  // app_user_id is set to the organizationId when configuring RevenueCat
  const organizationId = event.app_user_id;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!org) {
    request.log.warn(`Webhook for unknown org: ${organizationId}`);
    reply.status(200).send({ status: 'org_not_found' });
    return;
  }

  // Determine the new tier from entitlements
  let newTier: SubscriptionTier = 'STARTER';
  let newStatus: SubscriptionStatus = org.subscriptionStatus;

  if (event.entitlement_ids?.includes('pro')) {
    newTier = 'PRO';
  } else if (event.entitlement_ids?.includes('team')) {
    newTier = 'TEAM';
  } else if (event.entitlement_ids?.includes('starter')) {
    newTier = 'STARTER';
  }

  // Map RevenueCat event types to subscription status
  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
      newStatus = 'ACTIVE';
      break;
    case 'CANCELLATION':
      newStatus = 'CANCELED';
      break;
    case 'BILLING_ISSUE':
      newStatus = 'PAST_DUE';
      break;
    case 'EXPIRATION':
      newStatus = 'EXPIRED';
      newTier = 'STARTER';
      break;
    case 'SUBSCRIBER_ALIAS':
    case 'PRODUCT_CHANGE':
      // Tier change — status stays the same
      newStatus = 'ACTIVE';
      break;
    default:
      // Unknown event type — log but don't fail
      request.log.info(`Unhandled webhook event type: ${event.type}`);
  }

  // Update organization subscription
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      subscriptionTier: newTier,
      subscriptionStatus: newStatus,
    },
  });

  // Record billing event
  await prisma.billingEvent.create({
    data: {
      organizationId,
      type: event.type,
      tier: newTier,
      rcEventId: event.id || null,
      metadata: JSON.parse(JSON.stringify(event)),
    },
  });

  reply.status(200).send({ status: 'processed' });
}
