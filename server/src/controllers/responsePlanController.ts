import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { NotFoundError, AuthorizationError, ValidationError } from '../utils/errors';

const PLAN_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  steps: {
    select: { id: true, order: true, action: true, assignedTo: true },
    orderBy: { order: 'asc' as const },
  },
} as const;

interface StepInput {
  order: number;
  action: string;
  assignedTo?: string;
}

interface CreateBody {
  name: string;
  description?: string;
  steps?: StepInput[];
}

interface UpdateBody {
  name?: string;
  description?: string;
  steps?: StepInput[];
}

interface PlanParams {
  id: string;
}

export async function listPlans(request: FastifyRequest, reply: FastifyReply) {
  const plans = await prisma.responsePlan.findMany({
    where: { organizationId: request.organizationId },
    select: PLAN_SELECT,
    orderBy: { createdAt: 'desc' },
  });
  reply.send({ plans });
}

export async function createPlan(
  request: FastifyRequest<{ Body: CreateBody }>,
  reply: FastifyReply,
) {
  const { name, description, steps = [] } = request.body;
  if (!name?.trim()) throw new ValidationError('Plan name is required');

  const plan = await prisma.responsePlan.create({
    data: {
      organizationId: request.organizationId,
      name: name.trim(),
      description: description?.trim() || null,
      createdById: request.userId,
      steps: {
        create: steps.map((s, i) => ({
          order: s.order ?? i,
          action: s.action,
          assignedTo: s.assignedTo || null,
        })),
      },
    },
    select: PLAN_SELECT,
  });

  reply.status(201).send({ plan });
}

export async function updatePlan(
  request: FastifyRequest<{ Params: PlanParams; Body: UpdateBody }>,
  reply: FastifyReply,
) {
  const plan = await prisma.responsePlan.findUnique({ where: { id: request.params.id } });
  if (!plan) throw new NotFoundError('Response plan');
  if (plan.organizationId !== request.organizationId) throw new AuthorizationError();

  const { name, description, steps } = request.body;

  const updated = await prisma.responsePlan.update({
    where: { id: plan.id },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(steps
        ? {
            steps: {
              deleteMany: {},
              create: steps.map((s, i) => ({
                order: s.order ?? i,
                action: s.action,
                assignedTo: s.assignedTo || null,
              })),
            },
          }
        : {}),
    },
    select: PLAN_SELECT,
  });

  reply.send({ plan: updated });
}

export async function deletePlan(
  request: FastifyRequest<{ Params: PlanParams }>,
  reply: FastifyReply,
) {
  const plan = await prisma.responsePlan.findUnique({ where: { id: request.params.id } });
  if (!plan) throw new NotFoundError('Response plan');
  if (plan.organizationId !== request.organizationId) throw new AuthorizationError();

  await prisma.responsePlan.delete({ where: { id: plan.id } });
  reply.status(204).send();
}
