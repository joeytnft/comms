import { randomUUID } from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { NotFoundError, ValidationError, AuthorizationError, ConflictError } from '../utils/errors';
import { sendInviteEmail } from '../services/emailService';

interface UpdateProfileBody {
  displayName?: string;
  phone?: string;
  avatarUrl?: string;
  currentPassword?: string;
  newPassword?: string;
}

interface UpdatePublicKeyBody {
  publicKey: string;
}

interface UpdatePushTokenBody {
  expoPushToken: string | null;
}

interface AdminUpdateBody {
  displayName?: string;
  phone?: string;
  isOrgAdmin?: boolean;
}

interface InviteUserBody {
  email: string;
  displayName: string;
  campusId?: string;
  isOrgAdmin?: boolean;
}

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  phone: true,
  avatarUrl: true,
  publicKey: true,
  organizationId: true,
  campusId: true,
  isOrgAdmin: true,
  createdAt: true,
  lastSeenAt: true,
} as const;

export async function getMe(request: FastifyRequest, reply: FastifyReply) {
  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: USER_SELECT,
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  // Include the org invite code so members can share it from Settings
  const org = await prisma.organization.findUnique({
    where: { id: request.organizationId },
    select: { id: true, name: true, inviteCode: true, createdBy: true },
  });

  let role: 'owner' | 'admin' | 'member' = 'member';
  if (org?.createdBy === user.id) role = 'owner';
  else if (user.isOrgAdmin) role = 'admin';

  reply.send({ user: { ...user, role }, organization: org ? { id: org.id, name: org.name, inviteCode: org.inviteCode } : null });
}

export async function updateMe(
  request: FastifyRequest<{ Body: UpdateProfileBody }>,
  reply: FastifyReply,
) {
  const { displayName, phone, avatarUrl, currentPassword, newPassword } = request.body;

  const data: Record<string, string | null> = {};
  if (displayName) data.displayName = displayName;
  if (phone !== undefined) data.phone = phone || null;
  if (avatarUrl !== undefined) data.avatarUrl = avatarUrl || null;

  if (newPassword) {
    if (!currentPassword) throw new ValidationError('Current password is required to set a new password');
    if (newPassword.length < 8) throw new ValidationError('New password must be at least 8 characters');
    const current = await prisma.user.findUnique({ where: { id: request.userId }, select: { passwordHash: true } });
    const bcrypt = await import('bcrypt');
    const valid = await bcrypt.compare(currentPassword, current?.passwordHash ?? '');
    if (!valid) throw new ValidationError('Current password is incorrect');
    data.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  const user = await prisma.user.update({
    where: { id: request.userId },
    data,
    select: USER_SELECT,
  });

  reply.send({ user });
}

export async function updatePublicKey(
  request: FastifyRequest<{ Body: UpdatePublicKeyBody }>,
  reply: FastifyReply,
) {
  const { publicKey } = request.body;

  if (!publicKey) {
    throw new ValidationError('Public key is required');
  }

  await prisma.user.update({
    where: { id: request.userId },
    data: { publicKey },
  });

  reply.status(204).send();
}

export async function updatePushToken(
  request: FastifyRequest<{ Body: UpdatePushTokenBody }>,
  reply: FastifyReply,
) {
  const { expoPushToken } = request.body;

  await prisma.user.update({
    where: { id: request.userId },
    data: { expoPushToken: expoPushToken || null },
  });

  reply.status(204).send();
}

export async function getUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const user = await prisma.user.findFirst({
    where: { id: request.params.id, organizationId: request.organizationId },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      publicKey: true,
      organizationId: true,
      lastSeenAt: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  reply.send({ user });
}

async function requireOrgAdmin(requestUserId: string, organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { createdBy: true },
  });
  if (!org) throw new NotFoundError('Organization');

  if (org.createdBy === requestUserId) return; // owner

  const caller = await prisma.user.findUnique({
    where: { id: requestUserId },
    select: { isOrgAdmin: true },
  });
  if (!caller?.isOrgAdmin) {
    throw new AuthorizationError('Only org admins can perform this action');
  }
}

export async function listOrgMembers(request: FastifyRequest, reply: FastifyReply) {
  await requireOrgAdmin(request.userId, request.organizationId);

  const members = await prisma.user.findMany({
    where: { organizationId: request.organizationId },
    select: {
      ...USER_SELECT,
      campus: { select: { id: true, name: true } },
    },
    orderBy: { displayName: 'asc' },
  });

  // Derive role for each member
  const org = await prisma.organization.findUnique({
    where: { id: request.organizationId },
    select: { createdBy: true },
  });

  const membersWithRole = members.map((m) => ({
    ...m,
    role: org?.createdBy === m.id ? 'owner' : m.isOrgAdmin ? 'admin' : 'member',
  }));

  reply.send({ members: membersWithRole });
}

export async function adminUpdateUser(
  request: FastifyRequest<{ Params: { id: string }; Body: AdminUpdateBody }>,
  reply: FastifyReply,
) {
  await requireOrgAdmin(request.userId, request.organizationId);

  const { id } = request.params;
  const { displayName, phone, isOrgAdmin } = request.body;

  // Ensure target belongs to same org
  const target = await prisma.user.findFirst({
    where: { id, organizationId: request.organizationId },
    select: { id: true },
  });
  if (!target) throw new NotFoundError('User');

  // Prevent demoting the org owner
  if (isOrgAdmin === false) {
    const org = await prisma.organization.findUnique({
      where: { id: request.organizationId },
      select: { createdBy: true },
    });
    if (org?.createdBy === id) {
      throw new ValidationError('Cannot remove admin role from the organization owner');
    }
  }

  const data: Record<string, unknown> = {};
  if (displayName) data.displayName = displayName;
  if (phone !== undefined) data.phone = phone || null;
  if (isOrgAdmin !== undefined) data.isOrgAdmin = isOrgAdmin;

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: USER_SELECT,
  });

  reply.send({ user: updated });
}

export async function inviteUser(
  request: FastifyRequest<{ Body: InviteUserBody }>,
  reply: FastifyReply,
) {
  await requireOrgAdmin(request.userId, request.organizationId);

  const { email, displayName, campusId, isOrgAdmin } = request.body;
  if (!email || !displayName) throw new ValidationError('Email and display name are required');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('A user with that email already exists');

  const org = await prisma.organization.findUnique({
    where: { id: request.organizationId },
    select: { name: true },
  });
  if (!org) throw new NotFoundError('Organization');

  const inviteToken = randomUUID();
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash: '',
      organizationId: request.organizationId,
      campusId: campusId || null,
      isOrgAdmin: isOrgAdmin ?? false,
      accountStatus: 'INVITED',
      inviteToken,
      inviteExpiresAt,
    },
    select: USER_SELECT,
  });

  sendInviteEmail(email, displayName, org.name, inviteToken).catch(
    (err: unknown) => request.log.error(err, 'Failed to send invite email'),
  );

  reply.status(201).send({ user });
}

export async function removeMember(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await requireOrgAdmin(request.userId, request.organizationId);

  const { id } = request.params;

  if (id === request.userId) throw new ValidationError('You cannot remove yourself');

  const target = await prisma.user.findFirst({
    where: { id, organizationId: request.organizationId },
    select: { id: true },
  });
  if (!target) throw new NotFoundError('User');

  const org = await prisma.organization.findUnique({
    where: { id: request.organizationId },
    select: { createdBy: true },
  });
  if (org?.createdBy === id) throw new ValidationError('Cannot remove the organization owner');

  await prisma.user.delete({ where: { id } });

  reply.send({ ok: true });
}
