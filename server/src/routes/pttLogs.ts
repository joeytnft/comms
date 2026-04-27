import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { canUserAccessGroup } from '../services/groups/hierarchyService';

export async function pttLogRoutes(app: FastifyInstance) {
  // GET /ptt-logs/:groupId — fetch voice log history for a group
  app.get<{ Params: { groupId: string }; Querystring: { cursor?: string; limit?: string } }>(
    '/:groupId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { groupId } = request.params;
      const limit = Math.min(parseInt(request.query.limit || '100', 10), 100);
      const { cursor } = request.query;
      const { userId } = request;

      // Use the hierarchy-aware accessor: lead-group members can read sub-group
      // logs, and the call also asserts the group is in the caller's org so a
      // stale cross-tenant membership row cannot leak data.
      const allowed = await canUserAccessGroup(userId, groupId, request.organizationId);
      if (!allowed) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Not a member of this group' });
      }

      const [logs, totalCount] = await Promise.all([
        prisma.pttLog.findMany({
          where: { groupId, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
          orderBy: { createdAt: 'desc' },
          take: limit + 1,
          include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
        }),
        prisma.pttLog.count({ where: { groupId } }),
      ]);

      const hasMore = logs.length > limit;
      const items = hasMore ? logs.slice(0, limit) : logs;
      const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

      return reply.send({ logs: items, nextCursor, totalCount });
    },
  );
}
