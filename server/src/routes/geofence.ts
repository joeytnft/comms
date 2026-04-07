import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';

interface GeofenceBody {
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // metres
}

async function canManageGeofence(userId: string, organizationId: string): Promise<boolean> {
  // Org creator can always manage geofence
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { createdBy: true },
  });
  if (org?.createdBy === userId) return true;

  // Any group admin in the org can also manage geofence
  const adminMembership = await prisma.groupMembership.findFirst({
    where: {
      userId,
      role: 'ADMIN',
      group: { organizationId },
    },
    include: { group: { select: { organizationId: true } } },
  });
  return !!adminMembership;
}

export async function geofenceRoutes(app: FastifyInstance) {
  // GET /geofence — get org geofence
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const geofence = await prisma.geofence.findUnique({
      where: { organizationId: request.organizationId },
    });
    return reply.send({ geofence });
  });

  // PUT /geofence — create or update org geofence
  app.put<{ Body: GeofenceBody }>(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { userId, organizationId } = request;
      const { name, latitude, longitude, radius } = request.body;

      const allowed = await canManageGeofence(userId, organizationId);
      if (!allowed) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'You must be the org creator or a group admin to manage the geofence.',
        });
      }

      const geofence = await prisma.geofence.upsert({
        where: { organizationId },
        create: { organizationId, name, latitude, longitude, radius },
        update: { name, latitude, longitude, radius },
      });
      return reply.send({ geofence });
    },
  );

  // DELETE /geofence — remove geofence
  app.delete('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { userId, organizationId } = request;

    const allowed = await canManageGeofence(userId, organizationId);
    if (!allowed) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Admin role required' });
    }

    await prisma.geofence.deleteMany({ where: { organizationId } });
    return reply.send({ success: true });
  });
}
