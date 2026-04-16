import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import * as userController from '../controllers/userController';

export async function userRoutes(app: FastifyInstance) {
  // All user routes require authentication
  app.addHook('onRequest', authenticate);

  app.get('/me', userController.getMe);
  app.put('/me', userController.updateMe);
  app.put('/me/public-key', userController.updatePublicKey);
  app.put('/me/push-token', userController.updatePushToken);
  app.get('/org-members', userController.listOrgMembers);
  app.get('/:id', userController.getUser);
  app.patch('/:id', userController.adminUpdateUser);
}
