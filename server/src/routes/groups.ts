import { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../middleware/auth';
import { checkGroupLimit } from '../middleware/subscription';
import * as groupController from '../controllers/groupController';

export async function groupRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  // Hierarchy — must be before /:id to avoid param conflict
  app.get('/hierarchy', groupController.getHierarchy);

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
}
