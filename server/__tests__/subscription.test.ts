import { buildApp } from '../src/app';
import { FastifyInstance } from 'fastify';
import { prisma } from '../src/config/database';

let app: FastifyInstance;
let accessToken: string;
let orgId: string;

const testOrg = {
  name: 'Sub Test Church',
  createdBy: 'seed',
  inviteCode: 'SUB-TEST-CODE',
};

const testUser = {
  email: 'sub-test@guardiancomm.app',
  password: 'securepassword123',
  displayName: 'Sub Tester',
  organizationCode: 'SUB-TEST-CODE',
};

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // Clean up
  await prisma.billingEvent.deleteMany({});
  await prisma.groupMembership.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [testUser.email, 'sub-limit@guardiancomm.app'] } },
  });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });

  // Create org
  const org = await prisma.organization.create({ data: testOrg });
  orgId = org.id;

  // Register test user
  const regResponse = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: testUser,
  });
  accessToken = regResponse.json().tokens.accessToken;
});

afterAll(async () => {
  await prisma.billingEvent.deleteMany({});
  await prisma.groupMembership.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [testUser.email, 'sub-limit@guardiancomm.app'] } },
  });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });
  await prisma.$disconnect();
  await app.close();
});

describe('GET /subscription', () => {
  it('should return subscription info for authenticated user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/subscription',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { subscription } = response.json();
    expect(subscription.tier).toBeDefined();
    expect(subscription.status).toBeDefined();
    expect(subscription.limits).toBeDefined();
    expect(subscription.usage).toBeDefined();
    expect(subscription.usage.members).toBeGreaterThanOrEqual(1);
  });

  it('should reject unauthenticated request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/subscription',
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /subscription/plans', () => {
  it('should return available plans', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/subscription/plans',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { plans } = response.json();
    expect(plans).toHaveLength(3);
    expect(plans.map((p: any) => p.tier)).toEqual(['FREE', 'TEAM', 'PRO']);
  });
});

describe('Trial initialization', () => {
  it('should set trialEndsAt on first user registration', async () => {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { trialEndsAt: true, subscriptionStatus: true },
    });

    expect(org).toBeDefined();
    expect(org!.trialEndsAt).toBeDefined();
    expect(org!.subscriptionStatus).toBe('TRIALING');

    // Trial should be ~14 days from now
    const daysUntilExpiry = Math.round(
      (new Date(org!.trialEndsAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    expect(daysUntilExpiry).toBeGreaterThanOrEqual(13);
    expect(daysUntilExpiry).toBeLessThanOrEqual(14);
  });
});

describe('POST /subscription/webhook — RevenueCat', () => {
  it('should process INITIAL_PURCHASE event', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/subscription/webhook',
      payload: {
        event: {
          type: 'INITIAL_PURCHASE',
          id: 'evt_test_initial',
          app_user_id: orgId,
          entitlement_ids: ['team'],
        },
        api_version: '1.0',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('processed');

    // Verify org was updated
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { subscriptionTier: true, subscriptionStatus: true },
    });
    expect(org!.subscriptionTier).toBe('TEAM');
    expect(org!.subscriptionStatus).toBe('ACTIVE');
  });

  it('should be idempotent for duplicate events', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/subscription/webhook',
      payload: {
        event: {
          type: 'INITIAL_PURCHASE',
          id: 'evt_test_initial', // same event ID
          app_user_id: orgId,
          entitlement_ids: ['team'],
        },
        api_version: '1.0',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('already_processed');
  });

  it('should handle CANCELLATION event', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/subscription/webhook',
      payload: {
        event: {
          type: 'CANCELLATION',
          id: 'evt_test_cancel',
          app_user_id: orgId,
          entitlement_ids: ['team'],
        },
        api_version: '1.0',
      },
    });

    expect(response.statusCode).toBe(200);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { subscriptionStatus: true },
    });
    expect(org!.subscriptionStatus).toBe('CANCELED');
  });

  it('should handle EXPIRATION event — revert to FREE', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/subscription/webhook',
      payload: {
        event: {
          type: 'EXPIRATION',
          id: 'evt_test_expire',
          app_user_id: orgId,
          entitlement_ids: [],
        },
        api_version: '1.0',
      },
    });

    expect(response.statusCode).toBe(200);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { subscriptionTier: true, subscriptionStatus: true },
    });
    expect(org!.subscriptionTier).toBe('FREE');
    expect(org!.subscriptionStatus).toBe('EXPIRED');
  });

  it('should handle PRO upgrade via entitlements', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/subscription/webhook',
      payload: {
        event: {
          type: 'INITIAL_PURCHASE',
          id: 'evt_test_pro',
          app_user_id: orgId,
          entitlement_ids: ['pro'],
        },
        api_version: '1.0',
      },
    });

    expect(response.statusCode).toBe(200);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { subscriptionTier: true },
    });
    expect(org!.subscriptionTier).toBe('PRO');
  });

  it('should reject invalid webhook payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/subscription/webhook',
      payload: { event: {} },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 200 for unknown org (graceful handling)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/subscription/webhook',
      payload: {
        event: {
          type: 'RENEWAL',
          id: 'evt_unknown_org',
          app_user_id: 'nonexistent-org-id',
        },
        api_version: '1.0',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('org_not_found');
  });
});

describe('Group limit enforcement', () => {
  it('should allow creating a group on FREE plan after reverting to FREE', async () => {
    // Org was set to FREE by the expiration test above — reset to TRIALING so limits apply
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        subscriptionTier: 'FREE',
        subscriptionStatus: 'TRIALING',
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'First Group', type: 'LEAD' },
    });

    expect(response.statusCode).toBe(201);
  });

  it('should block second group on FREE plan (limit: 1)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Second Group', type: 'LEAD' },
    });

    expect(response.statusCode).toBe(403);
  });
});
