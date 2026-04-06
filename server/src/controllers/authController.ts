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
import { FREE_TRIAL_DAYS } from '../config/subscriptions';

interface RegisterBody {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  organizationCode?: string;   // Optional: for joining existing org
  organizationName?: string;    // Optional: for creating new org
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

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
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
  const { email, password, displayName, phone, organizationCode, organizationName } = request.body;

  if (!email || !password || !displayName) {
    throw new ValidationError('Email, password, and displayName are required');
  }

  // Must provide EITHER organizationCode OR organizationName
  if (!organizationCode && !organizationName) {
    throw new ValidationError(
      'Either organizationCode (to join) or organizationName (to create) is required',
    );
  }

  if (organizationCode && organizationName) {
    throw new ValidationError(
      'Cannot provide both organizationCode and organizationName. Choose one.',
    );
  }

  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  // Check if email already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new ConflictError('A user with that email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  let organization;

  // FLOW 1: Join existing organization with invite code
  if (organizationCode) {
    organization = await prisma.organization.findUnique({
      where: { inviteCode: organizationCode },
    });

    if (!organization) {
      throw new NotFoundError('Organization with that invite code');
    }
  }
  // FLOW 2: Create new organization (admin signup)
  else if (organizationName) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + FREE_TRIAL_DAYS);

    organization = await prisma.organization.create({
      data: {
        name: organizationName,
        createdBy: email, // Temporarily use email; will update with userId after user creation
        subscriptionTier: 'FREE',
        subscriptionStatus: 'TRIALING',
        trialEndsAt: trialEnd,
      },
    });
  }

  if (!organization) {
    throw new Error('Failed to resolve or create organization');
  }

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

  // Update organization createdBy if this was a new org
  if (organizationName) {
    await prisma.organization.update({
      where: { id: organization.id },
      data: { createdBy: user.id },
    });
  }

  // Generate tokens
  const accessToken = request.server.jwt.sign({
    userId: user.id,
    organizationId: user.organizationId,
  });

  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      token: hashToken(refreshToken),
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
      token: hashToken(refreshToken),
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
    where: { token: hashToken(refreshToken) },
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
      token: hashToken(newRefreshToken),
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
    // Delete the specific refresh token (look up by hash)
    await prisma.refreshToken.deleteMany({
      where: { token: hashToken(refreshToken) },
    });
  }

  reply.status(204).send();
}
