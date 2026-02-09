import { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../config/database';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';

interface RegisterBody {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  organizationCode: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface RefreshBody {
  refreshToken: string;
}

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

function getRefreshExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return expiry;
}

export async function register(
  request: FastifyRequest<{ Body: RegisterBody }>,
  reply: FastifyReply,
) {
  const { email, password, displayName, phone, organizationCode } = request.body;

  if (!email || !password || !displayName || !organizationCode) {
    throw new ValidationError('Email, password, displayName, and organizationCode are required');
  }

  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  // Find the organization by invite code
  const organization = await prisma.organization.findUnique({
    where: { inviteCode: organizationCode },
  });

  if (!organization) {
    throw new NotFoundError('Organization with that invite code');
  }

  // Check if email already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new ConflictError('A user with that email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName,
      phone: phone || null,
      organizationId: organization.id,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      phone: true,
      avatarUrl: true,
      publicKey: true,
      organizationId: true,
      createdAt: true,
      lastSeenAt: true,
    },
  });

  // Generate tokens
  const accessToken = request.server.jwt.sign({
    userId: user.id,
    organizationId: user.organizationId,
  });

  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: getRefreshExpiry(),
    },
  });

  reply.status(201).send({
    user,
    tokens: {
      accessToken,
      refreshToken,
    },
  });
}

export async function login(
  request: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply,
) {
  const { email, password } = request.body;

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AuthenticationError('Invalid email or password');
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Update last seen
  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() },
  });

  // Generate tokens
  const accessToken = request.server.jwt.sign({
    userId: user.id,
    organizationId: user.organizationId,
  });

  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: getRefreshExpiry(),
    },
  });

  reply.send({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      publicKey: user.publicKey,
      organizationId: user.organizationId,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  });
}

export async function refresh(
  request: FastifyRequest<{ Body: RefreshBody }>,
  reply: FastifyReply,
) {
  const { refreshToken } = request.body;

  if (!refreshToken) {
    throw new ValidationError('Refresh token is required');
  }

  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!storedToken) {
    throw new AuthenticationError('Invalid refresh token');
  }

  if (storedToken.expiresAt < new Date()) {
    // Clean up expired token
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    throw new AuthenticationError('Refresh token expired');
  }

  // Rotate refresh token: delete old, create new
  await prisma.refreshToken.delete({ where: { id: storedToken.id } });

  const newAccessToken = request.server.jwt.sign({
    userId: storedToken.user.id,
    organizationId: storedToken.user.organizationId,
  });

  const newRefreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      token: newRefreshToken,
      userId: storedToken.user.id,
      expiresAt: getRefreshExpiry(),
    },
  });

  reply.send({
    tokens: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    },
  });
}

export async function logout(
  request: FastifyRequest<{ Body: RefreshBody }>,
  reply: FastifyReply,
) {
  const { refreshToken } = request.body;

  if (refreshToken) {
    // Delete the specific refresh token
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  reply.status(204).send();
}
