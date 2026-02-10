import { buildApp } from '../src/app';
import { FastifyInstance } from 'fastify';
import { prisma } from '../src/config/database';

let app: FastifyInstance;
let adminToken: string;
let memberToken: string;
let adminUserId: string;
let memberUserId: string;
let orgId: string;
let groupId: string;

const testOrg = {
  name: 'PTT Test Church',
  createdBy: 'seed',
  inviteCode: 'PTT-TEST-CODE',
};

const adminUser = {
  email: 'ptt-admin@guardiancomm.app',
  password: 'securepassword123',
  displayName: 'PTT Admin',
  organizationCode: 'PTT-TEST-CODE',
};

const memberUser = {
  email: 'ptt-member@guardiancomm.app',
  password: 'securepassword123',
  displayName: 'PTT Member',
  organizationCode: 'PTT-TEST-CODE',
};

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // Clean up
  await prisma.groupMembership.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [adminUser.email, memberUser.email] } },
  });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });

  // Create org with active subscription (PTT needs ptt feature enabled)
  const org = await prisma.organization.create({
    data: {
      ...testOrg,
      subscriptionTier: 'FREE', // FREE tier includes PTT
      subscriptionStatus: 'TRIALING',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  orgId = org.id;

  // Register admin
  const adminRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: adminUser,
  });
  const adminBody = adminRes.json();
  adminToken = adminBody.tokens.accessToken;
  adminUserId = adminBody.user.id;

  // Register member
  const memberRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: memberUser,
  });
  const memberBody = memberRes.json();
  memberToken = memberBody.tokens.accessToken;
  memberUserId = memberBody.user.id;

  // Create a LEAD group
  const groupRes = await app.inject({
    method: 'POST',
    url: '/groups',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: 'PTT Test Group', type: 'LEAD' },
  });
  groupId = groupRes.json().group.id;

  // Add member to the group
  await app.inject({
    method: 'POST',
    url: `/groups/${groupId}/members`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { email: memberUser.email },
  });
});

afterAll(async () => {
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

describe('GET /ptt/:groupId/token', () => {
  it('should return a LiveKit token for a group member', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/ptt/${groupId}/token`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe('string');
    expect(body.roomName).toBe(`ptt:${groupId}`);
    expect(body.livekitUrl).toBeDefined();
    expect(body.groupName).toBe('PTT Test Group');
  });

  it('should return token for member user too', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/ptt/${groupId}/token`,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().token).toBeDefined();
  });

  it('should reject unauthenticated request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/ptt/${groupId}/token`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject non-member trying to get token', async () => {
    // Create another user not in the group
    const otherOrg = await prisma.organization.create({
      data: {
        name: 'Other Church',
        createdBy: 'seed',
        inviteCode: 'PTT-OTHER-CODE',
        subscriptionTier: 'FREE',
        subscriptionStatus: 'TRIALING',
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    const otherRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'ptt-other@guardiancomm.app',
        password: 'securepassword123',
        displayName: 'Other User',
        organizationCode: 'PTT-OTHER-CODE',
      },
    });
    const otherToken = otherRes.json().tokens.accessToken;

    const response = await app.inject({
      method: 'GET',
      url: `/ptt/${groupId}/token`,
      headers: { authorization: `Bearer ${otherToken}` },
    });

    expect(response.statusCode).toBe(403);

    // Clean up
    await prisma.refreshToken.deleteMany({ where: { userId: otherRes.json().user.id } });
    await prisma.user.deleteMany({ where: { email: 'ptt-other@guardiancomm.app' } });
    await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
  });

  it('should reject request for nonexistent group', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/ptt/nonexistent-group-id/token`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('GET /ptt/:groupId/participants', () => {
  it('should return participants for a group member', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/ptt/${groupId}/participants`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.participants).toBeDefined();
    expect(Array.isArray(body.participants)).toBe(true);
    expect(body.participants.length).toBeGreaterThanOrEqual(2); // admin + member

    // Each participant should have expected fields
    const participant = body.participants[0];
    expect(participant.userId).toBeDefined();
    expect(participant.displayName).toBeDefined();
    expect(participant.role).toBeDefined();
  });

  it('should reject unauthenticated request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/ptt/${groupId}/participants`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject non-member', async () => {
    // Create a temp user not in the group but in the same org
    // (They need to be in the org for auth to work, but not a group member)
    const tempRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'ptt-temp@guardiancomm.app',
        password: 'securepassword123',
        displayName: 'Temp User',
        organizationCode: 'PTT-TEST-CODE',
      },
    });
    const tempToken = tempRes.json().tokens.accessToken;

    // Remove their auto-membership if any
    await prisma.groupMembership.deleteMany({
      where: { userId: tempRes.json().user.id, groupId },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/ptt/${groupId}/participants`,
      headers: { authorization: `Bearer ${tempToken}` },
    });

    expect(response.statusCode).toBe(403);

    // Clean up
    await prisma.refreshToken.deleteMany({ where: { userId: tempRes.json().user.id } });
    await prisma.user.deleteMany({ where: { email: 'ptt-temp@guardiancomm.app' } });
  });
});

describe('PTT feature gating', () => {
  it('should block PTT when subscription is expired', async () => {
    // Set org to expired
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionStatus: 'EXPIRED', subscriptionTier: 'FREE' },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/ptt/${groupId}/token`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(403);

    // Restore
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        subscriptionStatus: 'TRIALING',
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
  });
});
