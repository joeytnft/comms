import { buildApp } from '../src/app';
import { FastifyInstance } from 'fastify';
import { prisma } from '../src/config/database';

let app: FastifyInstance;
let adminToken: string;
let memberToken: string;
let adminUserId: string;
let memberUserId: string;
let orgId: string;

const testOrg = {
  name: 'Alerts Test Church',
  createdBy: 'seed',
  inviteCode: 'ALERTS-TEST-CODE',
};

const adminUser = {
  email: 'alerts-admin@gathersafeapp.com',
  password: 'securepassword123',
  displayName: 'Alerts Admin',
  organizationCode: 'ALERTS-TEST-CODE',
};

const memberUser = {
  email: 'alerts-member@gathersafeapp.com',
  password: 'securepassword123',
  displayName: 'Alerts Member',
  organizationCode: 'ALERTS-TEST-CODE',
};

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // Clean up
  await prisma.alertAcknowledgment.deleteMany({});
  await prisma.alert.deleteMany({});
  await prisma.groupMembership.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [adminUser.email, memberUser.email] } },
  });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });

  // Create org with BASIC tier (alerts require 'alerts' feature)
  const org = await prisma.organization.create({
    data: {
      ...testOrg,
      subscriptionTier: 'BASIC',
      subscriptionStatus: 'ACTIVE',
    },
  });
  orgId = org.id;

  // Register users
  const adminRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: adminUser,
  });
  const adminBody = adminRes.json();
  adminToken = adminBody.tokens.accessToken;
  adminUserId = adminBody.user.id;

  const memberRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: memberUser,
  });
  const memberBody = memberRes.json();
  memberToken = memberBody.tokens.accessToken;
  memberUserId = memberBody.user.id;
});

afterAll(async () => {
  await prisma.alertAcknowledgment.deleteMany({});
  await prisma.alert.deleteMany({});
  await prisma.groupMembership.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [adminUser.email, memberUser.email] } },
  });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });
  await prisma.$disconnect();
  await app.close();
});

describe('POST /alerts — Trigger Alert', () => {
  it('should trigger an ATTENTION alert', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { level: 'ATTENTION', message: 'Suspicious person in parking lot' },
    });

    expect(response.statusCode).toBe(201);
    const { alert } = response.json();
    expect(alert.level).toBe('ATTENTION');
    expect(alert.message).toBe('Suspicious person in parking lot');
    expect(alert.triggeredBy.displayName).toBe('Alerts Admin');
    expect(alert.acknowledgments).toEqual([]);
    expect(alert.resolvedAt).toBeNull();
  });

  it('should trigger a WARNING alert with location', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/alerts',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: {
        level: 'WARNING',
        message: 'Unknown vehicle',
        latitude: 33.749,
        longitude: -84.388,
      },
    });

    expect(response.statusCode).toBe(201);
    const { alert } = response.json();
    expect(alert.level).toBe('WARNING');
    expect(alert.latitude).toBe(33.749);
    expect(alert.longitude).toBe(-84.388);
  });

  it('should trigger an EMERGENCY alert without message', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { level: 'EMERGENCY' },
    });

    expect(response.statusCode).toBe(201);
    const { alert } = response.json();
    expect(alert.level).toBe('EMERGENCY');
    expect(alert.message).toBeNull();
  });

  it('should reject invalid alert level', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { level: 'INVALID' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject unauthenticated request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/alerts',
      payload: { level: 'ATTENTION' },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /alerts — List Alerts', () => {
  it('should list all alerts for the organization', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { alerts } = response.json();
    expect(alerts.length).toBeGreaterThanOrEqual(3); // created above
    expect(alerts[0].createdAt).toBeDefined();
  });

  it('should filter active (unresolved) alerts', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/alerts?active=true',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { alerts } = response.json();
    for (const alert of alerts) {
      expect(alert.resolvedAt).toBeNull();
    }
  });

  it('should support pagination via cursor', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/alerts?limit=1',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.alerts.length).toBe(1);
    expect(body.nextCursor).toBeDefined();

    // Fetch next page
    const page2 = await app.inject({
      method: 'GET',
      url: `/alerts?limit=1&cursor=${body.nextCursor}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(page2.statusCode).toBe(200);
    expect(page2.json().alerts[0].id).not.toBe(body.alerts[0].id);
  });
});

describe('POST /alerts/:id/acknowledge', () => {
  let alertId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { level: 'ATTENTION', message: 'Ack test' },
    });
    alertId = res.json().alert.id;
  });

  it('should acknowledge an alert', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/alerts/${alertId}/acknowledge`,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { alert } = response.json();
    expect(alert.acknowledgments.length).toBe(1);
    expect(alert.acknowledgments[0].userId).toBe(memberUserId);
  });

  it('should be idempotent — acknowledging twice does not duplicate', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/alerts/${alertId}/acknowledge`,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { alert } = response.json();
    expect(alert.acknowledgments.length).toBe(1);
  });

  it('should allow multiple users to acknowledge', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/alerts/${alertId}/acknowledge`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { alert } = response.json();
    expect(alert.acknowledgments.length).toBe(2);
  });
});

describe('POST /alerts/:id/resolve', () => {
  let alertId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { level: 'WARNING', message: 'Resolve test' },
    });
    alertId = res.json().alert.id;
  });

  it('should resolve an alert', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/alerts/${alertId}/resolve`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { alert } = response.json();
    expect(alert.resolvedAt).toBeDefined();
    expect(alert.resolvedAt).not.toBeNull();
  });

  it('should be idempotent — resolving an already resolved alert succeeds', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/alerts/${alertId}/resolve`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('Alerts feature gating', () => {
  it('should block alerts on FREE tier', async () => {
    // Downgrade org to FREE
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionTier: 'FREE' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { level: 'ATTENTION' },
    });

    expect(response.statusCode).toBe(403);

    // Restore
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionTier: 'BASIC' },
    });
  });

  it('should block alerts when subscription is expired', async () => {
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionStatus: 'EXPIRED' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(403);

    // Restore
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionStatus: 'ACTIVE' },
    });
  });

  it('should allow alerts on BASIC tier', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('Cross-organization isolation', () => {
  it('should not return alerts from other organizations', async () => {
    // Create another org and user
    const otherOrg = await prisma.organization.create({
      data: {
        name: 'Other Church',
        createdBy: 'seed',
        inviteCode: 'ALERTS-OTHER-CODE',
        subscriptionTier: 'BASIC',
        subscriptionStatus: 'ACTIVE',
      },
    });

    const otherRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'alerts-other@gathersafeapp.com',
        password: 'securepassword123',
        displayName: 'Other User',
        organizationCode: 'ALERTS-OTHER-CODE',
      },
    });
    const otherToken = otherRes.json().tokens.accessToken;

    // Create an alert in the other org
    await app.inject({
      method: 'POST',
      url: '/alerts',
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { level: 'ATTENTION', message: 'Other org alert' },
    });

    // Our admin should not see the other org's alert
    const response = await app.inject({
      method: 'GET',
      url: '/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const { alerts } = response.json();
    for (const alert of alerts) {
      expect(alert.organizationId).toBe(orgId);
    }

    // Cleanup
    await prisma.alertAcknowledgment.deleteMany({
      where: { alert: { organizationId: otherOrg.id } },
    });
    await prisma.alert.deleteMany({ where: { organizationId: otherOrg.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: otherRes.json().user.id } });
    await prisma.user.deleteMany({ where: { email: 'alerts-other@gathersafeapp.com' } });
    await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
  });
});
