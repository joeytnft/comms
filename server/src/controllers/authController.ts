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
import { sendPasswordResetEmail } from '../services/emailService';

const RESET_TOKEN_EXPIRY_MINUTES = 60;

interface RegisterBody {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  organizationCode?: string;   // Org invite code — joins org only
  organizationName?: string;   // Creates new org
  groupInviteCode?: string;    // Group invite code — joins org + group in one step
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
  const { email, password, displayName, phone, organizationCode, organizationName, groupInviteCode } = request.body;

  if (!email || !password || !displayName) {
    throw new ValidationError('Email, password, and displayName are required');
  }

  const codeCount = [organizationCode, organizationName, groupInviteCode].filter(Boolean).length;
  if (codeCount === 0) {
    throw new ValidationError(
      'Provide an organizationCode, groupInviteCode (to join), or organizationName (to create)',
    );
  }
  if (codeCount > 1) {
    throw new ValidationError('Provide only one of: organizationCode, groupInviteCode, organizationName');
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
  let groupToJoin: { id: string } | null = null;

  // FLOW 1: Join via group invite code — resolves org automatically
  if (groupInviteCode) {
    const group = await prisma.group.findUnique({
      where: { inviteCode: groupInviteCode.toUpperCase() },
      select: { id: true, organizationId: true },
    });
    if (!group) {
      throw new NotFoundError('Group with that invite code');
    }
    organization = await prisma.organization.findUnique({ where: { id: group.organizationId } });
    if (!organization) throw new Error('Organization not found');
    groupToJoin = group;
  }
  // FLOW 2: Join existing organization with org invite code
  else if (organizationCode) {
    organization = await prisma.organization.findUnique({
      where: { inviteCode: organizationCode },
    });
    if (!organization) {
      throw new NotFoundError('Organization with that invite code');
    }
  }
  // FLOW 3: Create new organization (admin signup)
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
      campusId: true,
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

  // Auto-join the group if they registered via a group invite code
  if (groupToJoin) {
    await prisma.groupMembership.create({
      data: { groupId: groupToJoin.id, userId: user.id, role: 'MEMBER' },
    });
  }

  // Generate tokens
  const accessToken = request.server.jwt.sign({
    userId: user.id,
    organizationId: user.organizationId,
    campusId: user.campusId ?? null,
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

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true, email: true, displayName: true, phone: true,
      avatarUrl: true, publicKey: true, organizationId: true,
      campusId: true, passwordHash: true, createdAt: true, lastSeenAt: true,
    },
  });
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
    campusId: user.campusId ?? null,
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
      campusId: user.campusId ?? null,
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
    include: { user: { select: { id: true, organizationId: true, campusId: true } } },
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
    campusId: storedToken.user.campusId ?? null,
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

export async function forgotPassword(
  request: FastifyRequest<{ Body: { email: string } }>,
  reply: FastifyReply,
) {
  const { email } = request.body;
  if (!email) throw new ValidationError('Email is required');

  // Always respond 200 so we don't reveal whether an account exists
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    reply.send({ message: 'If that email is registered you will receive a reset link shortly.' });
    return;
  }

  // Invalidate any existing tokens for this user
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { token, userId: user.id, expiresAt },
  });

  await sendPasswordResetEmail(user.email, token);

  reply.send({ message: 'If that email is registered you will receive a reset link shortly.' });
}

export async function resetPassword(
  request: FastifyRequest<{ Body: { token: string; password: string } }>,
  reply: FastifyReply,
) {
  const { token, password } = request.body;

  if (!token || !password) throw new ValidationError('Token and new password are required');
  if (password.length < 8) throw new ValidationError('Password must be at least 8 characters');

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!record || record.used || record.expiresAt < new Date()) {
    throw new AuthenticationError('This reset link is invalid or has expired');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } }),
    // Invalidate all refresh tokens so existing sessions are logged out
    prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
  ]);

  reply.send({ message: 'Password updated successfully. Please sign in with your new password.' });
}
