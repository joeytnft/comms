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
  name: 'Incidents Test Church',
  createdBy: 'seed',
  inviteCode: 'INC-TEST-CODE',
};

const adminUser = {
  email: 'inc-admin@guardiancomm.app',
  password: 'securepassword123',
  displayName: 'Inc Admin',
  organizationCode: 'INC-TEST-CODE',
};

const memberUser = {
  email: 'inc-member@guardiancomm.app',
  password: 'securepassword123',
  displayName: 'Inc Member',
  organizationCode: 'INC-TEST-CODE',
};

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // Clean up
  await prisma.incidentPhoto.deleteMany({});
  await prisma.incident.deleteMany({});
  await prisma.groupMembership.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [adminUser.email, memberUser.email] } },
  });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });

  // Create org with STANDARD tier (incidents require 'incidents' feature)
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
  await prisma.incidentPhoto.deleteMany({});
  await prisma.incident.deleteMany({});
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

describe('POST /incidents — Create Incident', () => {
  it('should create an incident', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Broken window in lobby',
        encryptedDetails: 'encrypted-details-blob',
        severity: 'MEDIUM',
      },
    });

    expect(response.statusCode).toBe(201);
    const { incident } = response.json();
    expect(incident.title).toBe('Broken window in lobby');
    expect(incident.severity).toBe('MEDIUM');
    expect(incident.status).toBe('OPEN');
    expect(incident.reportedBy.displayName).toBe('Inc Admin');
    expect(incident.photos).toEqual([]);
  });

  it('should create an incident with location', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: {
        title: 'Suspicious package',
        encryptedDetails: 'encrypted-details',
        severity: 'HIGH',
        latitude: 33.749,
        longitude: -84.388,
      },
    });

    expect(response.statusCode).toBe(201);
    const { incident } = response.json();
    expect(incident.latitude).toBe(33.749);
    expect(incident.longitude).toBe(-84.388);
    expect(incident.severity).toBe('HIGH');
  });

  it('should create a CRITICAL incident', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Active threat situation',
        encryptedDetails: 'encrypted-critical-details',
        severity: 'CRITICAL',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().incident.severity).toBe('CRITICAL');
  });

  it('should reject missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { title: 'Missing details' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject invalid severity', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Bad severity',
        encryptedDetails: 'details',
        severity: 'INVALID',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject unauthenticated request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      payload: { title: 'Test', encryptedDetails: 'data', severity: 'LOW' },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /incidents — List Incidents', () => {
  it('should list all incidents for the organization', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/incidents',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { incidents } = response.json();
    expect(incidents.length).toBeGreaterThanOrEqual(3);
  });

  it('should filter by status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/incidents?status=OPEN',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { incidents } = response.json();
    for (const incident of incidents) {
      expect(incident.status).toBe('OPEN');
    }
  });

  it('should support pagination', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/incidents?limit=1',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.incidents.length).toBe(1);
    expect(body.nextCursor).toBeDefined();
  });
});

describe('GET /incidents/:id — Get Incident', () => {
  let incidentId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Detail test incident',
        encryptedDetails: 'details-for-get',
        severity: 'LOW',
      },
    });
    incidentId = res.json().incident.id;
  });

  it('should return incident details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/incidents/${incidentId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { incident } = response.json();
    expect(incident.id).toBe(incidentId);
    expect(incident.title).toBe('Detail test incident');
  });

  it('should return 404 for nonexistent incident', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/incidents/nonexistent-id',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('PATCH /incidents/:id — Update Incident', () => {
  let incidentId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Update test',
        encryptedDetails: 'original-details',
        severity: 'LOW',
      },
    });
    incidentId = res.json().incident.id;
  });

  it('should update incident status to IN_PROGRESS', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/incidents/${incidentId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'IN_PROGRESS' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().incident.status).toBe('IN_PROGRESS');
  });

  it('should update severity and title', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/incidents/${incidentId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { title: 'Updated title', severity: 'HIGH' },
    });

    expect(response.statusCode).toBe(200);
    const { incident } = response.json();
    expect(incident.title).toBe('Updated title');
    expect(incident.severity).toBe('HIGH');
  });

  it('should set resolvedAt when status changes to RESOLVED', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/incidents/${incidentId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'RESOLVED' },
    });

    expect(response.statusCode).toBe(200);
    const { incident } = response.json();
    expect(incident.status).toBe('RESOLVED');
    expect(incident.resolvedAt).not.toBeNull();
  });
});

describe('POST /incidents/:id/photos — Add Photo', () => {
  let incidentId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Photo test',
        encryptedDetails: 'photo-test-details',
        severity: 'MEDIUM',
      },
    });
    incidentId = res.json().incident.id;
  });

  it('should add a photo to an incident', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/incidents/${incidentId}/photos`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { encryptedUrl: 'encrypted-s3-url-abc123' },
    });

    expect(response.statusCode).toBe(201);
    const { photo } = response.json();
    expect(photo.encryptedUrl).toBe('encrypted-s3-url-abc123');
    expect(photo.id).toBeDefined();
  });

  it('should add multiple photos', async () => {
    await app.inject({
      method: 'POST',
      url: `/incidents/${incidentId}/photos`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { encryptedUrl: 'encrypted-s3-url-second' },
    });

    // Get incident and verify photos
    const response = await app.inject({
      method: 'GET',
      url: `/incidents/${incidentId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.json().incident.photos.length).toBe(2);
  });

  it('should reject missing encryptedUrl', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/incidents/${incidentId}/photos`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('Incidents feature gating', () => {
  it('should block incidents on FREE tier', async () => {
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionTier: 'FREE' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { title: 'Test', encryptedDetails: 'data', severity: 'LOW' },
    });

    expect(response.statusCode).toBe(403);

    // Restore
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionTier: 'STANDARD' },
    });
  });

  it('should block incidents on BASIC tier', async () => {
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionTier: 'BASIC' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/incidents',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(403);

    // Restore
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionTier: 'STANDARD' },
    });
  });

  it('should allow incidents on STANDARD tier', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/incidents',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('Cross-organization isolation', () => {
  it('should not return incidents from other organizations', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: 'Other Church',
        createdBy: 'seed',
        inviteCode: 'INC-OTHER-CODE',
        subscriptionTier: 'STANDARD',
        subscriptionStatus: 'ACTIVE',
      },
    });

    const otherRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'inc-other@guardiancomm.app',
        password: 'securepassword123',
        displayName: 'Other User',
        organizationCode: 'INC-OTHER-CODE',
      },
    });
    const otherToken = otherRes.json().tokens.accessToken;

    await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { title: 'Other org incident', encryptedDetails: 'data', severity: 'LOW' },
    });

    // Our admin should not see the other org's incident
    const response = await app.inject({
      method: 'GET',
      url: '/incidents',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const { incidents } = response.json();
    for (const incident of incidents) {
      expect(incident.organizationId).toBe(orgId);
    }

    // Cleanup
    await prisma.incidentPhoto.deleteMany({
      where: { incident: { organizationId: otherOrg.id } },
    });
    await prisma.incident.deleteMany({ where: { organizationId: otherOrg.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: otherRes.json().user.id } });
    await prisma.user.deleteMany({ where: { email: 'inc-other@guardiancomm.app' } });
    await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
  });

  it('should reject GET for incident from another org', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: 'Another Church',
        createdBy: 'seed',
        inviteCode: 'INC-ANOTHER-CODE',
        subscriptionTier: 'STANDARD',
        subscriptionStatus: 'ACTIVE',
      },
    });

    const otherRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'inc-another@guardiancomm.app',
        password: 'securepassword123',
        displayName: 'Another User',
        organizationCode: 'INC-ANOTHER-CODE',
      },
    });
    const otherToken = otherRes.json().tokens.accessToken;

    const incidentRes = await app.inject({
      method: 'POST',
      url: '/incidents',
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { title: 'Private incident', encryptedDetails: 'data', severity: 'LOW' },
    });
    const incidentId = incidentRes.json().incident.id;

    // Try to access from our org
    const response = await app.inject({
      method: 'GET',
      url: `/incidents/${incidentId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(403);

    // Cleanup
    await prisma.incidentPhoto.deleteMany({
      where: { incident: { organizationId: otherOrg.id } },
    });
    await prisma.incident.deleteMany({ where: { organizationId: otherOrg.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: otherRes.json().user.id } });
    await prisma.user.deleteMany({ where: { email: 'inc-another@guardiancomm.app' } });
    await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
  });
});
