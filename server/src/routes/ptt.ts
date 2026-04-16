import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { requireFeature } from '../middleware/subscription';
import * as pttController from '../controllers/pttController';

export async function pttRoutes(app: FastifyInstance) {
  // All PTT routes require auth + PTT feature
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', requireFeature('ptt'));

  // Get LiveKit token to join a group's PTT room
  app.get('/:groupId/token', pttController.getToken);

  // Get participants in a PTT room
  app.get('/:groupId/participants', pttController.getParticipants);

  // Register an ephemeral APNs PTT push token (iOS only)
  app.post('/:groupId/register-token', pttController.registerPushToken);
}
