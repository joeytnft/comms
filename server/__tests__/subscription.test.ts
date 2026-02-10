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
  it('should return subscription info with separate lead/sub group usage', async () => {
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
    expect(subscription.limits.maxLeadGroups).toBeDefined();
    expect(subscription.limits.maxSubGroups).toBeDefined();
    expect(subscription.limits.maxMembers).toBeDefined();
    expect(subscription.usage).toBeDefined();
    expect(subscription.usage.members).toBeGreaterThanOrEqual(1);
    expect(subscription.usage.leadGroups).toBeDefined();
    expect(subscription.usage.subGroups).toBeDefined();
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
  it('should return 4 available plans', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/subscription/plans',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { plans } = response.json();
    expect(plans).toHaveLength(4);
    expect(plans.map((p: any) => p.tier)).toEqual(['FREE', 'BASIC', 'STANDARD', 'ENTERPRISE']);
  });

  it('should have correct pricing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/subscription/plans',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const { plans } = response.json();
    const prices = plans.map((p: any) => p.priceMonthly);
    expect(prices).toEqual([0, 2000, 4000, 6000]); // $0, $20, $40, $60
  });

  it('should have correct lead group limits', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/subscription/plans',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const { plans } = response.json();
    const leadLimits = plans.map((p: any) => p.limits.maxLeadGroups);
    expect(leadLimits).toEqual([1, 2, 5, -1]); // 1, 2, 5, unlimited
  });

  it('should have correct sub-group limits', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/subscription/plans',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const { plans } = response.json();
    const subLimits = plans.map((p: any) => p.limits.maxSubGroups);
    expect(subLimits).toEqual([5, -1, -1, -1]); // 5, unlimited, unlimited, unlimited
  });

  it('FREE tier should include PTT', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/subscription/plans',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const { plans } = response.json();
    const freePlan = plans.find((p: any) => p.tier === 'FREE');
    expect(freePlan.limits.features.ptt).toBe(true);
    expect(freePlan.limits.features.alerts).toBe(false);
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
  it('should process INITIAL_PURCHASE with basic entitlement', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/subscription/webhook',
      payload: {
        event: {
          type: 'INITIAL_PURCHASE',
          id: 'evt_test_basic',
          app_user_id: orgId,
          entitlement_ids: ['basic'],
        },
        api_version: '1.0',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('processed');

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { subscriptionTier: true, subscriptionStatus: true },
    });
    expect(org!.subscriptionTier).toBe('BASIC');
    expect(org!.subscriptionStatus).toBe('ACTIVE');
  });

  it('should be idempotent for duplicate events', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/subscription/webhook',
      payload: {
        event: {
          type: 'INITIAL_PURCHASE',
          id: 'evt_test_basic', // same event ID
          app_user_id: orgId,
          entitlement_ids: ['basic'],
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
          entitlement_ids: ['basic'],
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

  it('should handle standard upgrade via entitlements', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/subscription/webhook',
      payload: {
        event: {
          type: 'INITIAL_PURCHASE',
          id: 'evt_test_standard',
          app_user_id: orgId,
          entitlement_ids: ['standard'],
        },
        api_version: '1.0',
      },
    });

    expect(response.statusCode).toBe(200);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { subscriptionTier: true },
    });
    expect(org!.subscriptionTier).toBe('STANDARD');
  });

  it('should handle enterprise upgrade via entitlements', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/subscription/webhook',
      payload: {
        event: {
          type: 'PRODUCT_CHANGE',
          id: 'evt_test_enterprise',
          app_user_id: orgId,
          entitlement_ids: ['enterprise'],
        },
        api_version: '1.0',
      },
    });

    expect(response.statusCode).toBe(200);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { subscriptionTier: true },
    });
    expect(org!.subscriptionTier).toBe('ENTERPRISE');
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
  it('should allow creating a LEAD group on FREE plan', async () => {
    // Reset to FREE trialing
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
      payload: { name: 'First Lead Group', type: 'LEAD' },
    });

    expect(response.statusCode).toBe(201);
  });

  it('should block second LEAD group on FREE plan (limit: 1)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Second Lead Group', type: 'LEAD' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should allow sub-groups up to the FREE limit (5)', async () => {
    // Get the lead group
    const listRes = await app.inject({
      method: 'GET',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const leadGroup = listRes.json().groups.find((g: any) => g.type === 'LEAD');

    // Create 5 sub-groups
    for (let i = 0; i < 5; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/groups',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: `Sub ${i + 1}`, type: 'SUB', parentGroupId: leadGroup.id },
      });
      expect(response.statusCode).toBe(201);
    }
  });

  it('should block 6th sub-group on FREE plan (limit: 5)', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const leadGroup = listRes.json().groups.find((g: any) => g.type === 'LEAD');

    const response = await app.inject({
      method: 'POST',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Sub 6', type: 'SUB', parentGroupId: leadGroup.id },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should allow unlimited sub-groups on BASIC plan', async () => {
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionTier: 'BASIC', subscriptionStatus: 'ACTIVE' },
    });

    const listRes = await app.inject({
      method: 'GET',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const leadGroup = listRes.json().groups.find((g: any) => g.type === 'LEAD');

    // The 6th sub-group should now be allowed
    const response = await app.inject({
      method: 'POST',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Sub 6 on Basic', type: 'SUB', parentGroupId: leadGroup.id },
    });

    expect(response.statusCode).toBe(201);
  });
});
