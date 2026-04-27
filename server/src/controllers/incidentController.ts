import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { NotFoundError, AuthorizationError, ValidationError } from '../utils/errors';
import { assertAllowedHttpsUrl } from '../utils/validators';
import { env } from '../config/env';

// Hostnames whose URLs we allow tenants to attach to incident photos.
// Anything outside this list is refused — the previous code accepted any
// string, including pixel-tracking URLs that capture IP/UA of every
// responder who opens the incident.
function allowedPhotoHosts(): string[] {
  const supabaseHost = (() => {
    try { return new URL(env.SUPABASE_URL).hostname; } catch { return null; }
  })();
  return [supabaseHost].filter((h): h is string => !!h);
}

interface CreateBody {
  title: string;
  encryptedDetails: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  latitude?: number;
  longitude?: number;
}

interface UpdateBody {
  title?: string;
  encryptedDetails?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
}

interface IncidentParams {
  id: string;
}

const INCIDENT_SELECT = {
  id: true,
  organizationId: true,
  reportedById: true,
  title: true,
  encryptedDetails: true,
  severity: true,
  status: true,
  latitude: true,
  longitude: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  reportedBy: { select: { id: true, displayName: true } },
  photos: { select: { id: true, encryptedUrl: true, createdAt: true } },
};

export async function createIncident(
  request: FastifyRequest<{ Body: CreateBody }>,
  reply: FastifyReply,
) {
  const { title, encryptedDetails, severity, latitude, longitude } = request.body;
  const { userId, organizationId, campusId } = request;

  if (!title || !encryptedDetails || !severity) {
    throw new ValidationError('title, encryptedDetails, and severity are required');
  }

  if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)) {
    throw new ValidationError('Invalid severity level');
  }

  const incident = await prisma.incident.create({
    data: {
      organizationId,
      campusId: campusId ?? null,
      reportedById: userId,
      title,
      encryptedDetails,
      severity,
      latitude: latitude || null,
      longitude: longitude || null,
    },
    select: INCIDENT_SELECT,
  });

  reply.status(201).send({ incident });
}

export async function listIncidents(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { organizationId, campusId } = request;
  const query = request.query as { cursor?: string; limit?: string; status?: string };
  const limit = Math.min(parseInt(query.limit || '20', 10), 50);
  const where: Record<string, unknown> = {
    organizationId,
    ...(campusId ? { campusId } : {}),
  };
  if (query.status) {
    const s = query.status.toUpperCase();
    if (s === 'ACTIVE') {
      where.status = { in: ['OPEN', 'IN_PROGRESS'] };
    } else {
      where.status = s;
    }
  }

  const incidents = await prisma.incident.findMany({
    where,
    select: INCIDENT_SELECT,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const hasMore = incidents.length > limit;
  const results = hasMore ? incidents.slice(0, limit) : incidents;
  const nextCursor = hasMore ? results[results.length - 1].id : null;

  reply.send({ incidents: results, nextCursor });
}

export async function getIncident(
  request: FastifyRequest<{ Params: IncidentParams }>,
  reply: FastifyReply,
) {
  const incident = await prisma.incident.findUnique({
    where: { id: request.params.id },
    select: INCIDENT_SELECT,
  });

  if (!incident) throw new NotFoundError('Incident');
  if (incident.organizationId !== request.organizationId) {
    throw new AuthorizationError('Incident does not belong to your organization');
  }

  reply.send({ incident });
}

export async function updateIncident(
  request: FastifyRequest<{ Params: IncidentParams; Body: UpdateBody }>,
  reply: FastifyReply,
) {
  const { id } = request.params;
  const { title, encryptedDetails, severity, status } = request.body;

  const existing = await prisma.incident.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Incident');
  if (existing.organizationId !== request.organizationId) {
    throw new AuthorizationError('Incident does not belong to your organization');
  }

  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title;
  if (encryptedDetails !== undefined) data.encryptedDetails = encryptedDetails;
  if (severity !== undefined) data.severity = severity;
  if (status !== undefined) {
    data.status = status;
    if (status === 'RESOLVED' && !existing.resolvedAt) {
      data.resolvedAt = new Date();
    }
  }

  const incident = await prisma.incident.update({
    where: { id },
    data,
    select: INCIDENT_SELECT,
  });

  reply.send({ incident });
}

export async function addPhoto(
  request: FastifyRequest<{ Params: IncidentParams; Body: { encryptedUrl: string } }>,
  reply: FastifyReply,
) {
  const { id } = request.params;
  const { encryptedUrl } = request.body;

  const existing = await prisma.incident.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Incident');
  if (existing.organizationId !== request.organizationId) {
    throw new AuthorizationError('Incident does not belong to your organization');
  }

  if (!encryptedUrl) {
    throw new ValidationError('encryptedUrl is required');
  }
  // Reject arbitrary client-supplied URLs — must point at our own Supabase
  // bucket (uploaded via the authenticated upload endpoint). Without this
  // tenants could attach pixel-tracking URLs that capture every responder's
  // IP and User-Agent when they open the incident.
  assertAllowedHttpsUrl(encryptedUrl, allowedPhotoHosts());

  const photo = await prisma.incidentPhoto.create({
    data: { incidentId: id, encryptedUrl },
  });

  reply.status(201).send({ photo });
}
