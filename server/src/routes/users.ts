import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import * as userController from '../controllers/userController';

export async function userRoutes(app: FastifyInstance) {
  // All user routes require authentication
  app.addHook('onRequest', authenticate);

  app.get('/me', userController.getMe);
  app.put('/me', userController.updateMe);
  app.put('/me/public-key', userController.updatePublicKey);
  app.get('/', userController.listOrgMembers);
  app.patch('/:id', userController.adminUpdateUser);
  app.get('/:id', userController.getUser);
}
