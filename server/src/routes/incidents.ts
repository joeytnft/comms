import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { requireFeature } from '../middleware/subscription';
import * as incidentController from '../controllers/incidentController';

export async function incidentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', requireFeature('incidents'));

  app.post('/', incidentController.createIncident);
  app.get('/', incidentController.listIncidents);
  app.get('/:id', incidentController.getIncident);
  app.patch('/:id', incidentController.updateIncident);
  app.post('/:id/photos', incidentController.addPhoto);
}
