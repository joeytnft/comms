import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';

interface GeofenceBody {
  campusId: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // metres
}

interface GeofenceQuerystring {
  campusId: string;
}

async function canManageGeofence(userId: string, organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { createdBy: true },
  });
  if (org?.createdBy === userId) return true;

  const adminMembership = await prisma.groupMembership.findFirst({
    where: { userId, role: 'ADMIN', group: { organizationId } },
  });
  return !!adminMembership;
}

export async function geofenceRoutes(app: FastifyInstance) {
  // GET /geofence?campusId=xxx — get campus geofence
  app.get<{ Querystring: GeofenceQuerystring }>(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { campusId } = request.query;
      if (!campusId) return reply.status(400).send({ error: 'campusId is required' });

      const geofence = await prisma.geofence.findUnique({ where: { campusId } });
      return reply.send({ geofence });
    },
  );

  // PUT /geofence — create or update campus geofence
  app.put<{ Body: GeofenceBody }>(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { userId, organizationId } = request;
      const { campusId, name, latitude, longitude, radius } = request.body;

      if (!campusId) return reply.status(400).send({ error: 'campusId is required' });

      // Verify campus belongs to this org
      const campus = await prisma.campus.findFirst({
        where: { id: campusId, organizationId },
      });
      if (!campus) return reply.status(404).send({ error: 'Campus not found' });

      const allowed = await canManageGeofence(userId, organizationId);
      if (!allowed) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Admin role required' });
      }

      const geofence = await prisma.geofence.upsert({
        where: { campusId },
        create: { organizationId, campusId, name, latitude, longitude, radius },
        update: { name, latitude, longitude, radius },
      });
      return reply.send({ geofence });
    },
  );

  // DELETE /geofence?campusId=xxx — remove campus geofence
  app.delete<{ Querystring: GeofenceQuerystring }>(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { userId, organizationId } = request;
      const { campusId } = request.query;

      if (!campusId) return reply.status(400).send({ error: 'campusId is required' });

      const allowed = await canManageGeofence(userId, organizationId);
      if (!allowed) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Admin role required' });
      }

      await prisma.geofence.deleteMany({ where: { campusId, organizationId } });
      return reply.send({ success: true });
    },
  );
}
