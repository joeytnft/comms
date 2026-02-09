import { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { checkMemberLimit } from '../middleware/subscription';
import * as authController from '../controllers/authController';

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', authController.login);
  app.post('/register', { preHandler: [checkMemberLimit] }, authController.register as RouteHandlerMethod);
  app.post('/refresh', authController.refresh);
  app.post('/logout', authController.logout);
}
