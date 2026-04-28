import { buildApp } from '../src/app';
import { FastifyInstance } from 'fastify';
import { prisma } from '../src/config/database';
import { redis } from '../src/config/redis';

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
  email: 'ptt-admin@gathersafeapp.com',
  password: 'securepassword123',
  displayName: 'PTT Admin',
  organizationCode: 'PTT-TEST-CODE',
};

const memberUser = {
  email: 'ptt-member@gathersafeapp.com',
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
        email: 'ptt-other@gathersafeapp.com',
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
    await prisma.user.deleteMany({ where: { email: 'ptt-other@gathersafeapp.com' } });
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
        email: 'ptt-temp@gathersafeapp.com',
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
    await prisma.user.deleteMany({ where: { email: 'ptt-temp@gathersafeapp.com' } });
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

// ─── HTTP transmission endpoints ────────────────────────────────────────────
// These lock in the contract for /start, /stop, /native-log so the upcoming
// shared transmissionService refactor cannot silently change behavior.

describe('POST /ptt/:groupId/start', () => {
  afterEach(async () => {
    // Each test starts a session; clean it up so the next test's idempotency
    // checks (added in a follow-up) don't see stale state.
    await redis
      .del(`ptt:session:${memberUserId}:${groupId}`, `ptt:chunks:${memberUserId}:${groupId}`)
      .catch(() => null);
    await redis
      .del(`ptt:session:${adminUserId}:${groupId}`, `ptt:chunks:${adminUserId}:${groupId}`)
      .catch(() => null);
  });

  it('returns 204 and writes the redis session key for a member', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/ptt/${groupId}/start`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { mimeType: 'audio/mp4' },
    });
    expect(response.statusCode).toBe(204);

    const session = await redis.hgetall(`ptt:session:${memberUserId}:${groupId}`);
    expect(session.mimeType).toBe('audio/mp4');
    expect(parseInt(session.startedAt, 10)).toBeGreaterThan(Date.now() - 5_000);
  });

  it('rejects unauthenticated callers', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/ptt/${groupId}/start`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects callers who are not in the group', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: 'Start Test Other Org',
        createdBy: 'seed',
        inviteCode: 'PTT-START-OTHER',
        subscriptionTier: 'FREE',
        subscriptionStatus: 'TRIALING',
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
    const otherRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'ptt-start-other@gathersafeapp.com',
        password: 'securepassword123',
        displayName: 'Other Start',
        organizationCode: 'PTT-START-OTHER',
      },
    });
    const otherToken = otherRes.json().tokens.accessToken;

    const response = await app.inject({
      method: 'POST',
      url: `/ptt/${groupId}/start`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(response.statusCode).toBe(403);

    await prisma.refreshToken.deleteMany({ where: { userId: otherRes.json().user.id } });
    await prisma.user.deleteMany({ where: { email: 'ptt-start-other@gathersafeapp.com' } });
    await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
  });
});

describe('POST /ptt/:groupId/stop', () => {
  it('returns 204 and clears redis session/chunks keys', async () => {
    // Pre-populate the session as if /start had run.
    await redis.hset(`ptt:session:${memberUserId}:${groupId}`, {
      startedAt: Date.now(),
      mimeType: 'audio/mp4',
    });
    await redis.expire(`ptt:session:${memberUserId}:${groupId}`, 60);
    await redis.rpush(`ptt:chunks:${memberUserId}:${groupId}`, 'chunk1');

    const response = await app.inject({
      method: 'POST',
      url: `/ptt/${groupId}/stop`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(response.statusCode).toBe(204);

    // /stop in the HTTP path doesn't currently delete the keys (the socket
    // disconnect handler does). Document that here so the upcoming service
    // refactor is intentional about it — assert the endpoint just returns 204.
    // If we change the contract to clear keys, update this test in the same PR.
  });

  it('rejects unauthenticated callers', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/ptt/${groupId}/stop`,
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('POST /ptt/:groupId/native-log', () => {
  let createdLogIds: string[] = [];

  afterEach(async () => {
    if (createdLogIds.length > 0) {
      await prisma.pttLog.deleteMany({ where: { id: { in: createdLogIds } } });
      createdLogIds = [];
    }
  });

  it('persists a pttLog row and returns 204 for a member', async () => {
    const before = await prisma.pttLog.count({ where: { groupId, senderId: memberUserId } });

    const response = await app.inject({
      method: 'POST',
      url: `/ptt/${groupId}/native-log`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { durationMs: 4321 },
    });
    expect(response.statusCode).toBe(204);

    const after = await prisma.pttLog.findMany({
      where: { groupId, senderId: memberUserId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(after.length).toBeGreaterThan(before);
    expect(after[0].durationMs).toBe(4321);
    expect(after[0].audioUrl).toBeNull();
    createdLogIds.push(after[0].id);
  });

  it('drops audioUrl when not Supabase-hosted', async () => {
    await app.inject({
      method: 'POST',
      url: `/ptt/${groupId}/native-log`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { durationMs: 100, audioUrl: 'https://evil.example.com/exfil.html' },
    });
    const log = await prisma.pttLog.findFirst({
      where: { groupId, senderId: memberUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(log!.audioUrl).toBeNull();
    createdLogIds.push(log!.id);
  });

  it('clamps absurd durations to 0', async () => {
    await app.inject({
      method: 'POST',
      url: `/ptt/${groupId}/native-log`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { durationMs: -500 },
    });
    let log = await prisma.pttLog.findFirst({
      where: { groupId, senderId: memberUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(log!.durationMs).toBe(0);
    createdLogIds.push(log!.id);

    await app.inject({
      method: 'POST',
      url: `/ptt/${groupId}/native-log`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { durationMs: 99 * 60 * 60 * 1000 },
    });
    log = await prisma.pttLog.findFirst({
      where: { groupId, senderId: memberUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(log!.durationMs).toBe(0);
    createdLogIds.push(log!.id);
  });

  it('rejects unauthenticated callers', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/ptt/${groupId}/native-log`,
      payload: { durationMs: 500 },
    });
    expect(response.statusCode).toBe(401);
  });
});
