import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';

interface GeofenceBody {
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // metres
}

export async function geofenceRoutes(app: FastifyInstance) {
  // GET /geofence — get org geofence
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { userId } = request;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!user) return reply.status(404).send({ error: 'NOT_FOUND' });

    const geofence = await prisma.geofence.findUnique({
      where: { organizationId: user.organizationId },
    });
    return reply.send({ geofence });
  });

  // PUT /geofence — create or update org geofence (admin only)
  app.put<{ Body: GeofenceBody }>(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { userId } = request;
      const { name, latitude, longitude, radius } = request.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      });
      if (!user) return reply.status(404).send({ error: 'NOT_FOUND' });

      // Check admin role in any group
      const adminMembership = await prisma.groupMembership.findFirst({
        where: { userId, role: 'ADMIN' },
      });
      if (!adminMembership) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Admin role required' });
      }

      const geofence = await prisma.geofence.upsert({
        where: { organizationId: user.organizationId },
        create: { organizationId: user.organizationId, name, latitude, longitude, radius },
        update: { name, latitude, longitude, radius },
      });
      return reply.send({ geofence });
    },
  );

  // DELETE /geofence — remove geofence
  app.delete('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { userId } = request;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!user) return reply.status(404).send({ error: 'NOT_FOUND' });

    const adminMembership = await prisma.groupMembership.findFirst({
      where: { userId, role: 'ADMIN' },
    });
    if (!adminMembership) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Admin role required' });
    }

    await prisma.geofence.deleteMany({ where: { organizationId: user.organizationId } });
    return reply.send({ success: true });
  });
}
