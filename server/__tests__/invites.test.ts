import { buildApp } from '../src/app';
import { FastifyInstance } from 'fastify';
import { prisma } from '../src/config/database';

let app: FastifyInstance;
let adminToken: string;
let adminUserId: string;
let memberToken: string;
let memberUserId: string;
let orgId: string;
let leadGroupId: string;

const testOrg = {
  name: 'Invite Test Church',
  createdBy: 'seed',
  inviteCode: 'INVITE-TEST-CODE',
};

const adminUser = {
  email: 'invite-admin@guardiancomm.app',
  password: 'securepassword123',
  displayName: 'Invite Admin',
  organizationCode: 'INVITE-TEST-CODE',
};

const memberUser = {
  email: 'invite-member@guardiancomm.app',
  password: 'securepassword123',
  displayName: 'Invite Member',
  organizationCode: 'INVITE-TEST-CODE',
};

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // Clean up
  await prisma.groupMembership.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: [adminUser.email, memberUser.email] },
    },
  });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });

  // Create org
  const org = await prisma.organization.create({ data: testOrg });
  orgId = org.id;

  // Register admin user
  const adminRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: adminUser,
  });
  const adminBody = adminRes.json();
  adminToken = adminBody.tokens.accessToken;
  adminUserId = adminBody.user.id;

  // Register member user
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
    payload: {
      name: 'Invite Test Group',
      type: 'LEAD',
      description: 'Group for invite tests',
    },
  });
  leadGroupId = groupRes.json().group.id;
});

afterAll(async () => {
  await prisma.groupMembership.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: [adminUser.email, memberUser.email] },
    },
  });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });
  await prisma.$disconnect();
  await app.close();
});

describe('POST /groups/:id/invite — Generate Invite', () => {
  it('should generate an invite code (admin only)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${leadGroupId}/invite`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.inviteCode).toBeDefined();
    expect(body.inviteCode.length).toBe(8);
  });

  it('should reject non-admin generating invite', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${leadGroupId}/invite`,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    // Member is not in the group, so should be 403
    expect(response.statusCode).toBe(403);
  });

  it('should regenerate a new code if called again', async () => {
    // Get current code
    const groupRes = await app.inject({
      method: 'GET',
      url: `/groups/${leadGroupId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const oldCode = groupRes.json().group.inviteCode;

    // Regenerate
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${leadGroupId}/invite`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const newCode = response.json().inviteCode;
    expect(newCode).toBeDefined();
    expect(newCode).not.toBe(oldCode);
  });
});

describe('POST /groups/join — Join by Invite', () => {
  let inviteCode: string;

  beforeAll(async () => {
    // Get the current invite code
    const groupRes = await app.inject({
      method: 'GET',
      url: `/groups/${leadGroupId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    inviteCode = groupRes.json().group.inviteCode;
  });

  it('should allow org member to join by invite code', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/groups/join',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { inviteCode },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.group).toBeDefined();
    expect(body.group.id).toBe(leadGroupId);
  });

  it('should reject joining with invalid code', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/groups/join',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { inviteCode: 'BADCODE1' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('should reject joining group user is already in', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/groups/join',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { inviteCode },
    });

    expect(response.statusCode).toBe(409);
  });

  it('should reject unauthenticated join', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/groups/join',
      payload: { inviteCode },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should verify member was added to the group', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${leadGroupId}/members`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { members } = response.json();
    const joinedMember = members.find((m: any) => m.userId === memberUserId);
    expect(joinedMember).toBeDefined();
    expect(joinedMember.role).toBe('MEMBER');
  });
});

describe('DELETE /groups/:id/invite — Revoke Invite', () => {
  it('should revoke the invite code (admin only)', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/groups/${leadGroupId}/invite`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should confirm invite code is null after revoke', async () => {
    const groupRes = await app.inject({
      method: 'GET',
      url: `/groups/${leadGroupId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(groupRes.json().group.inviteCode).toBeNull();
  });

  it('should reject join after invite is revoked', async () => {
    // Remove the member first so we can test rejoin
    await app.inject({
      method: 'DELETE',
      url: `/groups/${leadGroupId}/members/${memberUserId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/groups/join',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { inviteCode: 'ANYCODE1' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('should reject non-admin revoking invite', async () => {
    // Re-generate an invite first
    await app.inject({
      method: 'POST',
      url: `/groups/${leadGroupId}/invite`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/groups/${leadGroupId}/invite`,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(response.statusCode).toBe(403);
  });
});
