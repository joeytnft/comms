import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { AuthorizationError, ValidationError, NotFoundError } from '../utils/errors';

const VALID_LEVELS = new Set(['ATTENTION', 'WARNING', 'EMERGENCY']);

async function requireAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isOrgAdmin: true,
      memberships: { where: { role: 'ADMIN' }, take: 1, select: { id: true } },
    },
  });
  if (!user?.isOrgAdmin && (user?.memberships.length ?? 0) === 0) {
    throw new AuthorizationError('Only administrators can manage custom alert types');
  }
}

export async function listCustomAlertTypes(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const types = await prisma.customAlertType.findMany({
    where: { organizationId: request.organizationId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, label: true, description: true, color: true, emoji: true, defaultLevel: true },
  });
  reply.send({ customAlertTypes: types });
}

interface CreateBody {
  label: string;
  description?: string;
  color: string;
  emoji: string;
  defaultLevel: string;
}

export async function createCustomAlertType(
  request: FastifyRequest<{ Body: CreateBody }>,
  reply: FastifyReply,
) {
  const { userId, organizationId } = request;
  await requireAdmin(userId);

  const { label, description = '', color, emoji, defaultLevel } = request.body;
  if (!label?.trim()) throw new ValidationError('Label is required');
  if (!color || !emoji) throw new ValidationError('Color and emoji are required');
  if (!VALID_LEVELS.has(defaultLevel)) throw new ValidationError('Invalid alert level');

  const type = await prisma.customAlertType.create({
    data: {
      organizationId,
      label: label.trim().slice(0, 50),
      description: description.trim().slice(0, 100),
      color,
      emoji: emoji.slice(0, 10),
      defaultLevel: defaultLevel as 'ATTENTION' | 'WARNING' | 'EMERGENCY',
      createdById: userId,
    },
    select: { id: true, label: true, description: true, color: true, emoji: true, defaultLevel: true },
  });

  reply.status(201).send({ customAlertType: type });
}

export async function deleteCustomAlertType(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { userId, organizationId } = request;
  await requireAdmin(userId);

  const existing = await prisma.customAlertType.findFirst({
    where: { id: request.params.id, organizationId },
  });
  if (!existing) throw new NotFoundError('Custom alert type');

  await prisma.customAlertType.delete({ where: { id: request.params.id } });
  reply.status(204).send();
}
