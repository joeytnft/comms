import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import * as pcoController from '../controllers/pcoController';

export async function integrationRoutes(app: FastifyInstance) {
  // OAuth callback — no auth (browser redirect from PCO)
  app.get('/pco/callback', pcoController.handleCallback);

  // Authenticated routes
  app.register(async (authedApp) => {
    authedApp.addHook('onRequest', authenticate);

    authedApp.get('/pco/status', pcoController.getStatus);
    authedApp.post('/pco/connect', pcoController.initiateConnect);
    authedApp.delete('/pco/disconnect', pcoController.disconnect);
    authedApp.post('/pco/sync/people', pcoController.syncPeopleHandler);
    authedApp.post('/pco/sync/services', pcoController.syncServicesHandler);
  });
}
