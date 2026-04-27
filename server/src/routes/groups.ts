import { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../middleware/auth';
import { checkGroupLimit } from '../middleware/subscription';
import * as groupController from '../controllers/groupController';

export async function groupRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  // Hierarchy — must be before /:id to avoid param conflict
  app.get('/hierarchy', groupController.getHierarchy);

  // Join by invite code — must be before /:id. Throttle aggressively:
  // 64-bit codes are infeasible to brute-force at any sane request rate
  // anyway, but the limiter shuts down credential-stuffing-style noise
  // and protects the DB roundtrip on each guess.
  app.post(
    '/join',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    groupController.joinByInvite,
  );

  // CRUD
  app.get('/', groupController.listGroups);
  app.post('/', { preHandler: [checkGroupLimit] }, groupController.createGroup as RouteHandlerMethod);
  app.get('/:id', groupController.getGroup);
  app.put('/:id', groupController.updateGroup);
  app.delete('/:id', groupController.deleteGroup);

  // Members
  app.get('/:id/members', groupController.getMembers);
  app.post('/:id/members', groupController.addMember);
  app.delete('/:id/members/:userId', groupController.removeMember);
  app.patch('/:id/members/:userId/role', groupController.updateMemberRole);

  // Campus assignment (Enterprise)
  app.patch('/:id/campus', groupController.assignCampus);

  // Invites
  app.post('/:id/invite', groupController.generateInvite);
  app.delete('/:id/invite', groupController.revokeInvite);

  // Group encryption key (shared among all members)
  app.get('/:id/key', groupController.getGroupKey);
}
