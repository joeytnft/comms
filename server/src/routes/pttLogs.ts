import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';

export async function pttLogRoutes(app: FastifyInstance) {
  // GET /ptt-logs/:groupId — fetch voice log history for a group
  app.get<{ Params: { groupId: string }; Querystring: { cursor?: string; limit?: string } }>(
    '/:groupId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { groupId } = request.params;
      const limit = Math.min(parseInt(request.query.limit || '30', 10), 50);
      const { cursor } = request.query;
      const { userId } = request;

      // Verify group membership
      const membership = await prisma.groupMembership.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });
      if (!membership) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Not a member of this group' });
      }

      const logs = await prisma.pttLog.findMany({
        where: { groupId, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
      });

      const hasMore = logs.length > limit;
      const items = hasMore ? logs.slice(0, limit) : logs;
      const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

      return reply.send({ logs: items, nextCursor });
    },
  );
}
