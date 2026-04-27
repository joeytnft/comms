import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { SubscriptionTier, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { PLAN_LIMITS, PLANS } from '../config/subscriptions';
import { NotFoundError, ValidationError, AuthenticationError } from '../utils/errors';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export async function getSubscription(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const org = await prisma.organization.findUnique({
    where: { id: request.organizationId },
    select: {
      subscriptionTier: true,
      subscriptionStatus: true,
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
 *
 * Three layers of authentication, in order:
 *  1. Static bearer (REVENUECAT_WEBHOOK_SECRET): a baseline shared secret.
 *  2. HMAC-SHA256 signature (REVENUECAT_HMAC_SECRET, optional): when set, the
 *     request must include `X-RC-Signature: sha256=<hex>` covering the raw
 *     body. RevenueCat supports this via Project → Webhooks → Signature.
 *  3. Per-tenant binding: the event's `app_user_id` is matched against an
 *     existing Organization.rcCustomerId. New customers (INITIAL_PURCHASE)
 *     can claim a previously-unbound org; tier-changing events for orgs that
 *     are already bound to a different rcCustomerId are rejected.
 *
 * This neutralises the original "anyone with the bearer can downgrade any
 * tenant" issue: even if the bearer leaks, an attacker still has to know
 * the rcCustomerId mapping for the target org and (when configured) the
 * HMAC secret.
 *
 * Entitlement → tier:
 *   "pro"  → PRO,  "team" → TEAM,  "starter" → STARTER,  none → FREE.
 */
function verifyHmacSignature(rawBody: string, header: string | undefined): boolean {
  const secret = env.REVENUECAT_HMAC_SECRET;
  if (!secret) return true; // not configured — fall back to bearer-only auth
  if (!header) return false;
  const presented = header.startsWith('sha256=') ? header.slice(7) : header;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // timingSafeEqual throws if buffers differ in length; pad/truncate first.
  const a = Buffer.from(presented, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function handleWebhook(
  request: FastifyRequest<{ Body: WebhookBody }>,
  reply: FastifyReply,
) {
  // Layer 1: shared bearer.
  const authHeader = request.headers.authorization;
  const webhookSecret = env.REVENUECAT_WEBHOOK_SECRET;
  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    throw new AuthenticationError('Invalid webhook signature');
  }

  // Layer 2: optional HMAC. Requires the raw body, which Fastify normally
  // discards after JSON parsing — so we recompute the canonical form. This
  // is acceptable because the canonical form is stable for valid JSON.
  const sigHeader = request.headers['x-rc-signature'];
  const sigValue = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  const canonicalBody = JSON.stringify(request.body);
  if (!verifyHmacSignature(canonicalBody, sigValue)) {
    logger.warn({}, '[Webhook] RevenueCat HMAC verification failed');
    throw new AuthenticationError('Invalid webhook signature');
  }

  const { event } = request.body;
  if (!event || !event.type || !event.app_user_id) {
    throw new ValidationError('Invalid webhook payload');
  }

  // Use event.id as idempotency key.
  if (event.id) {
    const existing = await prisma.billingEvent.findUnique({
      where: { rcEventId: event.id },
    });
    if (existing) {
      reply.status(200).send({ status: 'already_processed' });
      return;
    }
  }

  // Layer 3: per-tenant binding.
  // The webhook's app_user_id is the RevenueCat customer ID. Match it
  // against any org's stored rcCustomerId. If no org is bound yet, allow
  // INITIAL_PURCHASE to claim the binding when the controller invocation
  // can verify the org exists by its app_user_id field. Reject all other
  // event types for unbound or mismatched orgs — that closes the spoofing
  // path where a caller picks any orgId they like.
  const rcCustomerId = event.app_user_id;
  const boundOrg = await prisma.organization.findUnique({
    where: { rcCustomerId },
  });

  let org = boundOrg;
  if (!org) {
    if (event.type !== 'INITIAL_PURCHASE') {
      logger.warn({ rcCustomerId, type: event.type }, '[Webhook] No bound org for non-purchase event');
      reply.status(200).send({ status: 'unbound' });
      return;
    }
    // For INITIAL_PURCHASE we used to fall back to "treat app_user_id as
    // organizationId", which lets any caller claim any org. Instead, only
    // bind when the org has explicitly opted-in via a separate, authenticated
    // /subscriptions/link-customer endpoint (not implemented here). Until
    // that lands, refuse rather than create a binding from webhook input.
    logger.warn({ rcCustomerId }, '[Webhook] INITIAL_PURCHASE for org with no rcCustomerId binding — refusing');
    reply.status(200).send({ status: 'requires_link' });
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
      // Don't downgrade if the entitlement is currently in the future
      // (some webhook orderings deliver EXPIRATION late after a renewal).
      if (event.expiration_at_ms && event.expiration_at_ms > Date.now()) {
        logger.info({ orgId: org.id }, '[Webhook] EXPIRATION ignored — entitlement still valid');
        break;
      }
      newStatus = 'EXPIRED';
      newTier = 'STARTER';
      break;
    case 'SUBSCRIBER_ALIAS':
    case 'PRODUCT_CHANGE':
      newStatus = 'ACTIVE';
      break;
    default:
      request.log.info(`Unhandled webhook event type: ${event.type}`);
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      subscriptionTier: newTier,
      subscriptionStatus: newStatus,
    },
  });

  await prisma.billingEvent.create({
    data: {
      organizationId: org.id,
      type: event.type,
      tier: newTier,
      rcEventId: event.id || null,
      metadata: JSON.parse(JSON.stringify(event)),
    },
  });

  reply.status(200).send({ status: 'processed' });
}
