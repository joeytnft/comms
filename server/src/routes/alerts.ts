import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { requireFeature } from '../middleware/subscription';
import * as alertController from '../controllers/alertController';

export async function alertRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', requireFeature('alerts'));

  app.post('/', alertController.triggerAlert);
  app.get('/', alertController.listAlerts);
  app.get('/:id', alertController.getAlert);
  app.post('/:id/acknowledge', alertController.acknowledgeAlert);
  app.post('/:id/resolve', alertController.resolveAlert);
}
