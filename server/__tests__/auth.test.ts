import { buildApp } from '../src/app';
import { FastifyInstance } from 'fastify';
import { prisma } from '../src/config/database';

let app: FastifyInstance;

// Test data
const testOrg = {
  name: 'Test Church',
  createdBy: 'seed',
  inviteCode: 'TEST-INVITE-CODE',
};

const testUser = {
  email: 'test@guardiancomm.app',
  password: 'securepassword123',
  displayName: 'Test User',
  phone: '555-0100',
  organizationCode: 'TEST-INVITE-CODE',
};

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // Clean up any leftover test data
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({ where: { email: testUser.email } });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });

  // Create test organization
  await prisma.organization.create({ data: testOrg });
});

afterAll(async () => {
  // Clean up
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({ where: { email: testUser.email } });
  await prisma.organization.deleteMany({ where: { inviteCode: testOrg.inviteCode } });
  await prisma.$disconnect();
  await app.close();
});

describe('POST /auth/register', () => {
  it('should register a new user with valid data', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: testUser,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(testUser.email);
    expect(body.user.displayName).toBe(testUser.displayName);
    expect(body.tokens).toBeDefined();
    expect(body.tokens.accessToken).toBeDefined();
    expect(body.tokens.refreshToken).toBeDefined();
    // Password should never be returned
    expect(body.user.passwordHash).toBeUndefined();
  });

  it('should reject duplicate email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: testUser,
    });

    expect(response.statusCode).toBe(409);
  });

  it('should reject invalid organization code', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...testUser, email: 'other@test.com', organizationCode: 'INVALID' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('should reject short password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...testUser, email: 'short@test.com', password: '123' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'missing@test.com' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /auth/login', () => {
  it('should login with valid credentials', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: testUser.password,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.email).toBe(testUser.email);
    expect(body.tokens.accessToken).toBeDefined();
    expect(body.tokens.refreshToken).toBeDefined();
  });

  it('should reject wrong password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: 'wrongpassword',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject non-existent email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'nobody@test.com',
        password: 'anything',
      },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('POST /auth/refresh', () => {
  let refreshToken: string;

  beforeAll(async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: testUser.password,
      },
    });
    refreshToken = response.json().tokens.refreshToken;
  });

  it('should refresh tokens with valid refresh token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tokens.accessToken).toBeDefined();
    expect(body.tokens.refreshToken).toBeDefined();
    // New refresh token should be different (rotation)
    expect(body.tokens.refreshToken).not.toBe(refreshToken);
  });

  it('should reject used (rotated) refresh token', async () => {
    // The old refresh token was already rotated
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject invalid refresh token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'invalid-token' },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('should logout and invalidate refresh token', async () => {
    // Login to get fresh tokens
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: testUser.password,
      },
    });
    const { refreshToken } = loginResponse.json().tokens;

    // Logout
    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken },
    });

    expect(logoutResponse.statusCode).toBe(204);

    // Try to use the refresh token — should fail
    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });

    expect(refreshResponse.statusCode).toBe(401);
  });
});

describe('GET /users/me', () => {
  let accessToken: string;

  beforeAll(async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: testUser.password,
      },
    });
    accessToken = response.json().tokens.accessToken;
  });

  it('should return current user profile', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.email).toBe(testUser.email);
    expect(body.user.displayName).toBe(testUser.displayName);
  });

  it('should reject unauthenticated request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users/me',
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: {
        authorization: 'Bearer invalid-token',
      },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('PUT /users/me', () => {
  let accessToken: string;

  beforeAll(async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: testUser.password,
      },
    });
    accessToken = response.json().tokens.accessToken;
  });

  it('should update display name', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/users/me',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { displayName: 'Updated Name' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.displayName).toBe('Updated Name');
  });

  it('should reject empty update', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/users/me',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /health', () => {
  it('should return ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });
});
