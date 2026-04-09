import { FastifyRequest, FastifyReply } from 'fastify';
import { ValidationError, AuthorizationError } from '../utils/errors';
import * as svc from '../services/schedule/scheduleService';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireAdmin(request: FastifyRequest) {
  const { prisma } = await import('../config/database');
  const membership = await prisma.groupMembership.findFirst({
    where: { userId: request.userId, role: 'ADMIN', group: { organizationId: request.organizationId } },
  });
  if (!membership) throw new AuthorizationError('Admin access required');
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates(request: FastifyRequest, reply: FastifyReply) {
  const templates = await svc.listTemplates(request.organizationId);
  reply.send({ templates });
}

export async function createTemplate(
  request: FastifyRequest<{ Body: { name: string; dayOfWeek: number; startTime: string; description?: string } }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const { name, dayOfWeek, startTime, description } = request.body;
  if (!name?.trim() || dayOfWeek === undefined || !startTime) {
    throw new ValidationError('name, dayOfWeek, and startTime are required');
  }
  const template = await svc.createTemplate({
    organizationId: request.organizationId,
    createdById: request.userId,
    name, dayOfWeek, startTime, description,
  });
  reply.status(201).send({ template });
}

export async function updateTemplate(
  request: FastifyRequest<{ Params: { id: string }; Body: { name?: string; dayOfWeek?: number; startTime?: string; description?: string; isActive?: boolean } }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const template = await svc.updateTemplate(request.params.id, request.organizationId, request.body);
  reply.send({ template });
}

export async function deleteTemplate(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await requireAdmin(request);
  await svc.deleteTemplate(request.params.id, request.organizationId);
  reply.status(204).send();
}

export async function addRoleSlot(
  request: FastifyRequest<{ Params: { id: string }; Body: { roleName: string; postId?: string; count?: number } }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const { roleName, postId, count } = request.body;
  if (!roleName?.trim()) throw new ValidationError('roleName is required');
  const slot = await svc.addRoleSlot(request.params.id, request.organizationId, { roleName, postId, count });
  reply.status(201).send({ slot });
}

export async function removeRoleSlot(
  request: FastifyRequest<{ Params: { id: string; slotId: string } }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  await svc.removeRoleSlot(request.params.slotId, request.organizationId);
  reply.status(204).send();
}

export async function generateFromTemplate(
  request: FastifyRequest<{ Params: { id: string }; Body: { startDate: string; endDate: string } }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const { startDate, endDate } = request.body;
  if (!startDate || !endDate) throw new ValidationError('startDate and endDate are required');
  const result = await svc.generateFromTemplate(
    request.params.id,
    request.organizationId,
    request.userId,
    new Date(startDate),
    new Date(endDate),
  );
  reply.send(result);
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export async function listPosts(request: FastifyRequest, reply: FastifyReply) {
  const posts = await svc.listPosts(request.organizationId);
  reply.send({ posts });
}

export async function createPost(request: FastifyRequest<{ Body: { name: string; zone?: string; description?: string } }>, reply: FastifyReply) {
  await requireAdmin(request);
  const { name, zone, description } = request.body;
  if (!name?.trim()) throw new ValidationError('Post name is required');
  const post = await svc.createPost(request.organizationId, name, zone, description);
  reply.status(201).send({ post });
}

export async function deletePost(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await requireAdmin(request);
  await svc.deletePost(request.params.id, request.organizationId);
  reply.status(204).send();
}

// ── Services ──────────────────────────────────────────────────────────────────

export async function listServices(request: FastifyRequest, reply: FastifyReply) {
  const q = request.query as { from?: string; to?: string; limit?: string };
  const services = await svc.listServices(request.organizationId, {
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
    limit: q.limit ? parseInt(q.limit, 10) : 20,
  });
  reply.send({ services });
}

export async function getTodayServices(request: FastifyRequest, reply: FastifyReply) {
  const services = await svc.getTodayServices(request.organizationId);
  reply.send({ services });
}

export async function getService(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const service = await svc.getService(request.params.id, request.organizationId);
  reply.send({ service });
}

export async function createService(
  request: FastifyRequest<{ Body: { name: string; serviceDate: string; description?: string } }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const { name, serviceDate, description } = request.body;
  if (!name?.trim() || !serviceDate) throw new ValidationError('name and serviceDate are required');
  const service = await svc.createService({
    organizationId: request.organizationId,
    createdById: request.userId,
    name,
    serviceDate: new Date(serviceDate),
    description,
  });
  reply.status(201).send({ service });
}

export async function updateService(
  request: FastifyRequest<{ Params: { id: string }; Body: { name?: string; serviceDate?: string; description?: string } }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const { name, serviceDate, description } = request.body;
  const service = await svc.updateService(request.params.id, request.organizationId, {
    name,
    serviceDate: serviceDate ? new Date(serviceDate) : undefined,
    description,
  });
  reply.send({ service });
}

export async function deleteService(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await requireAdmin(request);
  await svc.deleteService(request.params.id, request.organizationId);
  reply.status(204).send();
}

// ── Assignments ───────────────────────────────────────────────────────────────

export async function assignUser(
  request: FastifyRequest<{ Params: { id: string }; Body: { userId: string; postId?: string; role?: string; notes?: string } }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  const { userId, postId, role, notes } = request.body;
  if (!userId) throw new ValidationError('userId is required');
  const assignment = await svc.assignUser({
    serviceId: request.params.id,
    organizationId: request.organizationId,
    targetUserId: userId,
    postId,
    role,
    notes,
  });
  reply.status(201).send({ assignment });
}

export async function removeAssignment(
  request: FastifyRequest<{ Params: { id: string; assignmentId: string } }>,
  reply: FastifyReply,
) {
  await requireAdmin(request);
  await svc.removeAssignment(request.params.assignmentId, request.organizationId);
  reply.status(204).send();
}

export async function getMyAssignment(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const assignment = await svc.getMyAssignment(request.params.id, request.userId);
  reply.send({ assignment });
}

// ── Check-in ──────────────────────────────────────────────────────────────────

export async function checkIn(request: FastifyRequest<{ Params: { assignmentId: string } }>, reply: FastifyReply) {
  const assignment = await svc.checkIn(request.params.assignmentId, request.userId, request.organizationId);
  reply.send({ assignment });
}

export async function checkOut(request: FastifyRequest<{ Params: { assignmentId: string } }>, reply: FastifyReply) {
  const assignment = await svc.checkOut(request.params.assignmentId, request.userId, request.organizationId);
  reply.send({ assignment });
}

// ── Swap Requests ─────────────────────────────────────────────────────────────

export async function requestSwap(
  request: FastifyRequest<{ Params: { assignmentId: string }; Body: { toUserId: string; message?: string } }>,
  reply: FastifyReply,
) {
  const { toUserId, message } = request.body;
  if (!toUserId) throw new ValidationError('toUserId is required');
  const swap = await svc.requestSwap({
    fromAssignmentId: request.params.assignmentId,
    userId: request.userId,
    organizationId: request.organizationId,
    toUserId,
    message,
  });
  reply.status(201).send({ swap });
}

export async function respondToSwap(
  request: FastifyRequest<{ Params: { id: string }; Body: { accept: boolean } }>,
  reply: FastifyReply,
) {
  const { accept } = request.body;
  if (typeof accept !== 'boolean') throw new ValidationError('accept (boolean) is required');
  const swap = await svc.respondToSwap(request.params.id, request.userId, request.organizationId, accept);
  reply.send({ swap });
}

export async function listSwapRequests(request: FastifyRequest, reply: FastifyReply) {
  const swaps = await svc.listSwapRequests(request.userId, request.organizationId);
  reply.send({ swaps });
}
