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
  name: 'Location Test Church',
  createdBy: 'seed',
  inviteCode: 'LOC-TEST-CODE',
};

const adminUser = {
  email: 'loc-admin@guardiancomm.app',
  password: 'securepassword123',
  displayName: 'Loc Admin',
  organizationCode: 'LOC-TEST-CODE',
};

const memberUser = {
  email: 'loc-member@guardiancomm.app',
  password: 'securepassword123',
  displayName: 'Loc Member',
  organizationCode: 'LOC-TEST-CODE',
};

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // Clean up
  await prisma.userLocation.deleteMany({});
  await prisma.groupMembership.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [adminUser.email, memberUser.email] } },
  });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });

  // Create org with STANDARD tier (location requires 'location' feature)
  const org = await prisma.organization.create({
    data: {
      ...testOrg,
      subscriptionTier: 'STANDARD',
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
  await prisma.userLocation.deleteMany({});
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

describe('POST /location — Update Location', () => {
  it('should update the user location', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/location',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { latitude: 33.749, longitude: -84.388 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');

    // Verify in database
    const loc = await prisma.userLocation.findUnique({ where: { userId: adminUserId } });
    expect(loc).not.toBeNull();
    expect(loc!.latitude).toBe(33.749);
    expect(loc!.longitude).toBe(-84.388);
  });

  it('should update (upsert) an existing location', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/location',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { latitude: 34.0, longitude: -85.0 },
    });

    expect(response.statusCode).toBe(200);

    const loc = await prisma.userLocation.findUnique({ where: { userId: adminUserId } });
    expect(loc!.latitude).toBe(34.0);
    expect(loc!.longitude).toBe(-85.0);
  });

  it('should update lastSeenAt on the user', async () => {
    const before = await prisma.user.findUnique({ where: { id: adminUserId } });
    const beforeLastSeen = before?.lastSeenAt;

    // Small delay to ensure timestamp changes
    await new Promise((r) => setTimeout(r, 50));

    await app.inject({
      method: 'POST',
      url: '/location',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { latitude: 34.0, longitude: -85.0 },
    });

    const after = await prisma.user.findUnique({ where: { id: adminUserId } });
    expect(after!.lastSeenAt).not.toBeNull();
    if (beforeLastSeen) {
      expect(after!.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(beforeLastSeen.getTime());
    }
  });

  it('should reject invalid coordinates', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/location',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { latitude: 'not-a-number', longitude: -84.388 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject unauthenticated request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/location',
      payload: { latitude: 33.749, longitude: -84.388 },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /location/team — Team Locations', () => {
  beforeAll(async () => {
    // Both users update their locations
    await app.inject({
      method: 'POST',
      url: '/location',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { latitude: 33.749, longitude: -84.388 },
    });
    await app.inject({
      method: 'POST',
      url: '/location',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { latitude: 33.750, longitude: -84.389 },
    });
  });

  it('should return team member locations', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/location/team',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { locations } = response.json();
    expect(locations.length).toBe(2);

    const adminLoc = locations.find((l: { userId: string }) => l.userId === adminUserId);
    expect(adminLoc).toBeDefined();
    expect(adminLoc.displayName).toBe('Loc Admin');
    expect(adminLoc.latitude).toBe(33.749);
    expect(adminLoc.longitude).toBe(-84.388);
    expect(adminLoc.lastSeenAt).toBeDefined();
    expect(adminLoc.updatedAt).toBeDefined();
  });

  it('should only show locations from the same organization', async () => {
    // Create another org and user
    const otherOrg = await prisma.organization.create({
      data: {
        name: 'Other Church',
        createdBy: 'seed',
        inviteCode: 'LOC-OTHER-CODE',
        subscriptionTier: 'STANDARD',
        subscriptionStatus: 'ACTIVE',
      },
    });

    const otherRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'loc-other@guardiancomm.app',
        password: 'securepassword123',
        displayName: 'Other User',
        organizationCode: 'LOC-OTHER-CODE',
      },
    });
    const otherToken = otherRes.json().tokens.accessToken;

    // Update other user's location
    await app.inject({
      method: 'POST',
      url: '/location',
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { latitude: 40.0, longitude: -74.0 },
    });

    // Our admin should not see the other org's location
    const response = await app.inject({
      method: 'GET',
      url: '/location/team',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const { locations } = response.json();
    for (const loc of locations) {
      expect(loc.userId).not.toBe(otherRes.json().user.id);
    }

    // Cleanup
    await prisma.userLocation.deleteMany({ where: { userId: otherRes.json().user.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: otherRes.json().user.id } });
    await prisma.user.deleteMany({ where: { email: 'loc-other@guardiancomm.app' } });
    await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
  });
});

describe('Location feature gating', () => {
  it('should block location on FREE tier', async () => {
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionTier: 'FREE' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/location',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { latitude: 33.0, longitude: -84.0 },
    });

    expect(response.statusCode).toBe(403);

    // Restore
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionTier: 'STANDARD' },
    });
  });

  it('should block location on BASIC tier', async () => {
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionTier: 'BASIC' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/location/team',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(403);

    // Restore
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionTier: 'STANDARD' },
    });
  });

  it('should allow location on STANDARD tier', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/location/team',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
  });
});
