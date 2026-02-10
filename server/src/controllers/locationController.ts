import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { ValidationError } from '../utils/errors';

interface UpdateLocationBody {
  latitude: number;
  longitude: number;
}

/**
 * POST /location — Update the authenticated user's location.
 */
export async function updateLocation(
  request: FastifyRequest<{ Body: UpdateLocationBody }>,
  reply: FastifyReply,
) {
  const { latitude, longitude } = request.body;
  const { userId } = request;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new ValidationError('latitude and longitude are required numbers');
  }

  // Update user's last known location and lastSeenAt
  // We store location in a simple table — for production, consider PostGIS
  await prisma.userLocation.upsert({
    where: { userId },
    create: {
      userId,
      latitude,
      longitude,
    },
    update: {
      latitude,
      longitude,
      updatedAt: new Date(),
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { lastSeenAt: new Date() },
  });

  reply.send({ status: 'ok' });
}

/**
 * GET /location/team — Get all team members' locations for the org.
 */
export async function getTeamLocations(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { organizationId } = request;

  const locations = await prisma.userLocation.findMany({
    where: {
      user: { organizationId },
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          lastSeenAt: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  reply.send({
    locations: locations.map((loc) => ({
      userId: loc.user.id,
      displayName: loc.user.displayName,
      avatarUrl: loc.user.avatarUrl,
      latitude: loc.latitude,
      longitude: loc.longitude,
      lastSeenAt: loc.user.lastSeenAt,
      updatedAt: loc.updatedAt,
    })),
  });
}
