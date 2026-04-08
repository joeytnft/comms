import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { NotFoundError, ValidationError } from '../utils/errors';

interface UpdateProfileBody {
  displayName?: string;
  phone?: string;
  avatarUrl?: string;
}

interface UpdatePublicKeyBody {
  publicKey: string;
}

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  phone: true,
  avatarUrl: true,
  publicKey: true,
  organizationId: true,
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
    select: { id: true, name: true, inviteCode: true },
  });

  reply.send({ user, organization: org });
}

export async function updateMe(
  request: FastifyRequest<{ Body: UpdateProfileBody }>,
  reply: FastifyReply,
) {
  const { displayName, phone, avatarUrl } = request.body;

  if (!displayName && phone === undefined && avatarUrl === undefined) {
    throw new ValidationError('At least one field must be provided');
  }

  const data: Record<string, string | null> = {};
  if (displayName) data.displayName = displayName;
  if (phone !== undefined) data.phone = phone || null;
  if (avatarUrl !== undefined) data.avatarUrl = avatarUrl || null;

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
