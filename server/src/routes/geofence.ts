import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';

interface GeofenceBody {
  campusId: string;
  name: string;
  type?: 'circle' | 'polygon';
  // circle fields
  latitude?: number;
  longitude?: number;
  radius?: number;
  // polygon field — array of [lng, lat] pairs (GeoJSON ring order)
  polygon?: number[][];
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

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Derive a lat/lng centroid and bounding-circle radius from a polygon ring.
// This keeps the mobile circle view working unchanged when a polygon is saved.
function polygonToBoundingCircle(ring: number[][]): { latitude: number; longitude: number; radius: number } {
  // Drop closing point if present (GeoJSON rings repeat first point)
  const pts = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;

  const latitude = pts.reduce((s, c) => s + c[1], 0) / pts.length;
  const longitude = pts.reduce((s, c) => s + c[0], 0) / pts.length;
  const radius = Math.max(...pts.map(([lng, lat]) => haversineMetres(latitude, longitude, lat, lng)));

  return { latitude, longitude, radius };
}

export async function geofenceRoutes(app: FastifyInstance) {
  // GET /geofence?campusId=xxx — get campus geofence (includes polygon for admin panel)
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
  // Accepts circle (latitude/longitude/radius) or polygon (polygon array).
  // For polygon, centroid + bounding radius are stored so the mobile map works unchanged.
  app.put<{ Body: GeofenceBody }>(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { userId, organizationId } = request;
      const { campusId, name, type = 'circle', latitude, longitude, radius, polygon } = request.body;

      if (!campusId) return reply.status(400).send({ error: 'campusId is required' });
      if (!name?.trim()) return reply.status(400).send({ error: 'name is required' });

      // Verify campus belongs to this org
      const campus = await prisma.campus.findFirst({
        where: { id: campusId, organizationId },
      });
      if (!campus) return reply.status(404).send({ error: 'Campus not found' });

      const allowed = await canManageGeofence(userId, organizationId);
      if (!allowed) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Admin role required' });
      }

      let lat: number;
      let lng: number;
      let rad: number;
      let poly: number[][] | null = null;

      if (type === 'polygon') {
        if (!polygon || polygon.length < 3) {
          return reply.status(400).send({ error: 'polygon must have at least 3 points' });
        }
        const bounding = polygonToBoundingCircle(polygon);
        lat = bounding.latitude;
        lng = bounding.longitude;
        rad = bounding.radius;
        poly = polygon;
      } else {
        if (latitude == null || longitude == null || radius == null) {
          return reply.status(400).send({ error: 'latitude, longitude and radius are required for circle type' });
        }
        lat = latitude;
        lng = longitude;
        rad = radius;
      }

      const geofence = await prisma.geofence.upsert({
        where: { campusId },
        create: { organizationId, campusId, name: name.trim(), type, latitude: lat, longitude: lng, radius: rad, polygon: poly ?? undefined },
        update: { name: name.trim(), type, latitude: lat, longitude: lng, radius: rad, polygon: poly ?? undefined },
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
