import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { requireFeature } from '../middleware/subscription';
import * as locationController from '../controllers/locationController';

export async function locationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', requireFeature('location'));

  app.post('/', locationController.updateLocation);
  app.get('/team', locationController.getTeamLocations);
}
