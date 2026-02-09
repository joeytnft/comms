import { buildApp } from '../src/app';
import { FastifyInstance } from 'fastify';
import { prisma } from '../src/config/database';

let app: FastifyInstance;
let accessToken: string;
let userId: string;
let orgId: string;

const testOrg = {
  name: 'Groups Test Church',
  createdBy: 'seed',
  inviteCode: 'GROUPS-TEST-CODE',
};

const testUser = {
  email: 'groups-test@guardiancomm.app',
  password: 'securepassword123',
  displayName: 'Groups Tester',
  organizationCode: 'GROUPS-TEST-CODE',
};

// Helper to create a second user in the same org
async function createSecondUser() {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'groups-member@guardiancomm.app',
      password: 'securepassword123',
      displayName: 'Second User',
      organizationCode: 'GROUPS-TEST-CODE',
    },
  });
  return response.json();
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // Clean up
  await prisma.groupMembership.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: [testUser.email, 'groups-member@guardiancomm.app'] },
    },
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
  const regBody = regResponse.json();
  accessToken = regBody.tokens.accessToken;
  userId = regBody.user.id;
});

afterAll(async () => {
  await prisma.groupMembership.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: [testUser.email, 'groups-member@guardiancomm.app'] },
    },
  });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });
  await prisma.$disconnect();
  await app.close();
});

describe('POST /groups — Create Group', () => {
  it('should create a LEAD group', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: 'Security Lead',
        type: 'LEAD',
        description: 'Main security team',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.group.name).toBe('Security Lead');
    expect(body.group.type).toBe('LEAD');
    expect(body.group.parentGroupId).toBeNull();
  });

  it('should auto-add creator as ADMIN', async () => {
    // Get the group we just created
    const listResponse = await app.inject({
      method: 'GET',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const groups = listResponse.json().groups;
    const leadGroup = groups.find((g: any) => g.name === 'Security Lead');

    const membersResponse = await app.inject({
      method: 'GET',
      url: `/groups/${leadGroup.id}/members`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(membersResponse.statusCode).toBe(200);
    const members = membersResponse.json().members;
    const creator = members.find((m: any) => m.userId === userId);
    expect(creator).toBeDefined();
    expect(creator.role).toBe('ADMIN');
  });

  it('should create a SUB group under a LEAD group', async () => {
    // Get the lead group
    const listResponse = await app.inject({
      method: 'GET',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const leadGroup = listResponse.json().groups.find((g: any) => g.type === 'LEAD');

    const response = await app.inject({
      method: 'POST',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: 'Parking Team',
        type: 'SUB',
        parentGroupId: leadGroup.id,
        description: 'Parking lot security',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.group.type).toBe('SUB');
    expect(body.group.parentGroupId).toBe(leadGroup.id);
  });

  it('should reject SUB group without parentGroupId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: 'Orphan Sub',
        type: 'SUB',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject SUB group under another SUB', async () => {
    const listResponse = await app.inject({
      method: 'GET',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const subGroup = listResponse.json().groups.find((g: any) => g.type === 'SUB');

    const response = await app.inject({
      method: 'POST',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: 'Nested Sub',
        type: 'SUB',
        parentGroupId: subGroup.id,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject unauthenticated group creation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/groups',
      payload: { name: 'No Auth', type: 'LEAD' },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /groups — List & Hierarchy', () => {
  it('should list groups for the user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { groups } = response.json();
    expect(groups.length).toBeGreaterThanOrEqual(2);
  });

  it('should return hierarchy', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/groups/hierarchy',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { hierarchy } = response.json();
    expect(hierarchy.length).toBeGreaterThanOrEqual(1);
    // Lead group should have subGroups
    const lead = hierarchy.find((h: any) => h.type === 'LEAD');
    expect(lead).toBeDefined();
    expect(lead.subGroups).toBeDefined();
  });
});

describe('Members', () => {
  let leadGroupId: string;
  let secondUserId: string;

  beforeAll(async () => {
    const listResponse = await app.inject({
      method: 'GET',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    leadGroupId = listResponse.json().groups.find((g: any) => g.type === 'LEAD').id;

    // Create second user
    const secondUser = await createSecondUser();
    secondUserId = secondUser.user.id;
  });

  it('should add a member by email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${leadGroupId}/members`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { email: 'groups-member@guardiancomm.app' },
    });

    expect(response.statusCode).toBe(201);
  });

  it('should list members', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${leadGroupId}/members`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { members } = response.json();
    expect(members.length).toBe(2);
  });

  it('should remove a member', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/groups/${leadGroupId}/members/${secondUserId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should not allow removing the last ADMIN', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/groups/${leadGroupId}/members/${userId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Should be rejected since this is the last admin
    expect(response.statusCode).toBe(400);
  });
});

describe('DELETE /groups/:id', () => {
  it('should reject deleting LEAD group with SUB groups', async () => {
    const listResponse = await app.inject({
      method: 'GET',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const leadGroup = listResponse.json().groups.find((g: any) => g.type === 'LEAD');

    const response = await app.inject({
      method: 'DELETE',
      url: `/groups/${leadGroup.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should delete a SUB group', async () => {
    const listResponse = await app.inject({
      method: 'GET',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const subGroup = listResponse.json().groups.find((g: any) => g.type === 'SUB');

    const response = await app.inject({
      method: 'DELETE',
      url: `/groups/${subGroup.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should delete LEAD group once SUBs are removed', async () => {
    const listResponse = await app.inject({
      method: 'GET',
      url: '/groups',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const leadGroup = listResponse.json().groups.find((g: any) => g.type === 'LEAD');

    const response = await app.inject({
      method: 'DELETE',
      url: `/groups/${leadGroup.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
  });
});
