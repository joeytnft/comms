import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { prisma } from '../config/database';
import { ValidationError, AuthorizationError } from '../utils/errors';

interface UpdateOrgBody { name?: string }

async function requireOwner(userId: string, organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { createdBy: true },
  });
  if (org?.createdBy !== userId) throw new AuthorizationError('Only the organization owner can update org settings');
}

export async function organizationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  app.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const org = await prisma.organization.findUnique({
      where: { id: request.organizationId },
      select: {
        id: true,
        name: true,
        inviteCode: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
    });
    reply.send({ organization: org });
  });

  app.patch<{ Body: UpdateOrgBody }>('/me', async (request: FastifyRequest<{ Body: UpdateOrgBody }>, reply: FastifyReply) => {
    await requireOwner(request.userId, request.organizationId);
    const { name } = request.body;
    if (!name?.trim()) throw new ValidationError('Organization name is required');
    const org = await prisma.organization.update({
      where: { id: request.organizationId },
      data: { name: name.trim() },
      select: { id: true, name: true },
    });
    reply.send({ organization: org });
  });
}
