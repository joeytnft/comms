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

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new ValidationError('Coordinates out of valid range (lat: -90..90, lon: -180..180)');
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
 *
 * Org-level users (no JWT campusId) see the whole org, or filter by ?campusId.
 * Campus-scoped users see their campus by default. If they pass ?campusId they
 * can view another campus they're a member of (verified via CampusUser table).
 *
 * Filtering uses CampusUser membership, not user.campusId, so multi-campus
 * members appear in every campus they belong to.
 */
export async function getTeamLocations(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { organizationId, campusId: jwtCampusId, userId } = request;
  const query = request.query as { campusId?: string };

  let campusFilter: string | null = null;

  if (jwtCampusId) {
    const requestedId = query.campusId || null;
    if (!requestedId || requestedId === jwtCampusId) {
      campusFilter = jwtCampusId;
    } else {
      // Only honour the override if this user is actually a member of that campus
      const membership = await prisma.campusUser.findUnique({
        where: { campusId_userId: { campusId: requestedId, userId } },
        select: { campusId: true },
      });
      campusFilter = membership ? requestedId : jwtCampusId;
    }
  } else {
    campusFilter = query.campusId || null;
  }

  const locations = await prisma.userLocation.findMany({
    where: {
      user: {
        organizationId,
        // Filter by junction-table membership so multi-campus members show up
        // in every campus they belong to, not just their primary campus.
        ...(campusFilter ? { campusMemberships: { some: { campusId: campusFilter } } } : {}),
      },
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
