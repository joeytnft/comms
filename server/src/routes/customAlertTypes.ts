import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { requireFeature } from '../middleware/subscription';
import * as ctrl from '../controllers/customAlertTypeController';

export async function customAlertTypeRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', requireFeature('alerts'));

  app.get('/', ctrl.listCustomAlertTypes);
  app.post('/', ctrl.createCustomAlertType);
  app.delete('/:id', ctrl.deleteCustomAlertType);
}
