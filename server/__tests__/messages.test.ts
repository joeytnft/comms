import { buildApp } from '../src/app';
import { FastifyInstance } from 'fastify';
import { prisma } from '../src/config/database';

let app: FastifyInstance;
let accessToken: string;
let secondAccessToken: string;
let userId: string;
let secondUserId: string;
let orgId: string;
let groupId: string;

const testOrg = {
  name: 'Messages Test Church',
  createdBy: 'seed',
  inviteCode: 'MSG-TEST-CODE',
};

const testUser = {
  email: 'msg-test@guardiancomm.app',
  password: 'securepassword123',
  displayName: 'Msg Tester',
  organizationCode: 'MSG-TEST-CODE',
};

const secondUser = {
  email: 'msg-member@guardiancomm.app',
  password: 'securepassword123',
  displayName: 'Second Tester',
  organizationCode: 'MSG-TEST-CODE',
};

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // Clean up
  await prisma.readReceipt.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.groupMembership.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [testUser.email, secondUser.email] } },
  });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });

  // Create org
  const org = await prisma.organization.create({ data: testOrg });
  orgId = org.id;

  // Register first user
  const reg1 = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: testUser,
  });
  const body1 = reg1.json();
  accessToken = body1.tokens.accessToken;
  userId = body1.user.id;

  // Register second user
  const reg2 = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: secondUser,
  });
  const body2 = reg2.json();
  secondAccessToken = body2.tokens.accessToken;
  secondUserId = body2.user.id;

  // Create a group and add both users
  const groupRes = await app.inject({
    method: 'POST',
    url: '/groups',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { name: 'Chat Test Group', type: 'LEAD' },
  });
  groupId = groupRes.json().group.id;

  // Add second user to group
  await app.inject({
    method: 'POST',
    url: `/groups/${groupId}/members`,
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { email: secondUser.email },
  });
});

afterAll(async () => {
  await prisma.readReceipt.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.groupMembership.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [testUser.email, secondUser.email] } },
  });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });
  await prisma.$disconnect();
  await app.close();
});

describe('POST /groups/:groupId/messages — Send Message', () => {
  it('should send an encrypted message', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/messages`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        encryptedContent: 'abc123encrypted',
        iv: 'def456iv',
      },
    });

    expect(response.statusCode).toBe(201);
    const { message } = response.json();
    expect(message.id).toBeDefined();
    expect(message.encryptedContent).toBe('abc123encrypted');
    expect(message.iv).toBe('def456iv');
    expect(message.senderId).toBe(userId);
    expect(message.type).toBe('TEXT');
    expect(message.sender.displayName).toBe(testUser.displayName);
  });

  it('should reject message without encryptedContent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/messages`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { iv: 'some-iv' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject message without iv', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/messages`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { encryptedContent: 'some-content' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject unauthenticated message', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/messages`,
      payload: { encryptedContent: 'test', iv: 'test' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject message to non-existent group', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/groups/nonexistent-id/messages',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { encryptedContent: 'test', iv: 'test' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('should allow second user to send a message', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/messages`,
      headers: { authorization: `Bearer ${secondAccessToken}` },
      payload: {
        encryptedContent: 'second-user-message',
        iv: 'second-iv',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().message.senderId).toBe(secondUserId);
  });
});

describe('GET /groups/:groupId/messages — Fetch Messages', () => {
  it('should return messages for the group', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/messages`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { messages, nextCursor } = response.json();
    expect(messages.length).toBeGreaterThanOrEqual(2);
    // Messages should be newest first
    expect(new Date(messages[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(messages[1].createdAt).getTime(),
    );
    // Each message should have isRead field
    expect(messages[0]).toHaveProperty('isRead');
  });

  it('should respect limit parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/messages?limit=1`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const { messages, nextCursor } = response.json();
    expect(messages.length).toBe(1);
    expect(nextCursor).toBeDefined();
  });

  it('should paginate with cursor', async () => {
    // Get first page
    const page1 = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/messages?limit=1`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const { nextCursor } = page1.json();

    // Get second page
    const page2 = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/messages?limit=1&cursor=${nextCursor}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(page2.statusCode).toBe(200);
    const page2Body = page2.json();
    expect(page2Body.messages.length).toBe(1);
    // Should be a different message than page 1
    expect(page2Body.messages[0].id).not.toBe(page1.json().messages[0].id);
  });

  it('should reject unauthenticated fetch', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/messages`,
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('POST /groups/:groupId/messages/read — Mark Read', () => {
  let messageId: string;

  beforeAll(async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/messages?limit=1`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    messageId = response.json().messages[0].id;
  });

  it('should mark messages as read', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/messages/read`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { messageIds: [messageId] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().readCount).toBe(1);
  });

  it('should be idempotent (marking again returns same count)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/messages/read`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { messageIds: [messageId] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().readCount).toBe(1);
  });

  it('should reject empty messageIds array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/messages/read`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { messageIds: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should show isRead=true after marking', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/messages`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const msg = response.json().messages.find((m: any) => m.id === messageId);
    expect(msg.isRead).toBe(true);
  });
});

describe('Access control', () => {
  let otherOrgToken: string;

  beforeAll(async () => {
    // Create a separate org + user
    const otherOrg = await prisma.organization.create({
      data: { name: 'Other Church', createdBy: 'seed', inviteCode: 'OTHER-MSG-CODE' },
    });

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'other-msg@guardiancomm.app',
        password: 'securepassword123',
        displayName: 'Other User',
        organizationCode: 'OTHER-MSG-CODE',
      },
    });
    otherOrgToken = reg.json().tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({ where: { email: 'other-msg@guardiancomm.app' } });
    await prisma.organization.deleteMany({ where: { inviteCode: 'OTHER-MSG-CODE' } });
  });

  it('should not allow user from another org to access group messages', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/messages`,
      headers: { authorization: `Bearer ${otherOrgToken}` },
    });

    // Should get 404 (group not found in their org)
    expect(response.statusCode).toBe(404);
  });

  it('should not allow user from another org to send messages', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/messages`,
      headers: { authorization: `Bearer ${otherOrgToken}` },
      payload: { encryptedContent: 'hack', iv: 'hack' },
    });

    expect(response.statusCode).toBe(404);
  });
});
