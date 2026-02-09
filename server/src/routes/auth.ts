import { FastifyInstance } from 'fastify';
import * as authController from '../controllers/authController';

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', authController.login);
  app.post('/register', authController.register);
  app.post('/refresh', authController.refresh);
  app.post('/logout', authController.logout);
}
