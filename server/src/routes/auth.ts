import { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { checkMemberLimit } from '../middleware/subscription';
import * as authController from '../controllers/authController';

const AUTH_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute',
    },
  },
};

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', AUTH_RATE_LIMIT, authController.login);
  app.post('/register', { ...AUTH_RATE_LIMIT, preHandler: [checkMemberLimit] }, authController.register as RouteHandlerMethod);
  app.post('/refresh', authController.refresh);
  app.post('/logout', authController.logout);
  app.post('/forgot-password', AUTH_RATE_LIMIT, authController.forgotPassword);
  app.post('/reset-password', AUTH_RATE_LIMIT, authController.resetPassword);
}
