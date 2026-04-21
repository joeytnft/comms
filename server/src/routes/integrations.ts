import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import * as pcoController from '../controllers/pcoController';

export async function integrationRoutes(app: FastifyInstance) {
  // OAuth callback — no auth (browser redirect from PCO)
  app.get('/pco/callback', pcoController.handleCallback);

  // Authenticated routes
  app.register(async (authedApp) => {
    authedApp.addHook('onRequest', authenticate);

    // Connection
    authedApp.get('/pco/status', pcoController.getStatus);
    authedApp.post('/pco/connect', pcoController.initiateConnect);
    authedApp.delete('/pco/disconnect', pcoController.disconnect);

    // People
    authedApp.post('/pco/sync/people', pcoController.syncPeopleHandler);
    authedApp.get('/pco/people', pcoController.getPeopleHandler);

    // Teams
    authedApp.post('/pco/sync/teams', pcoController.syncTeamsHandler);
    authedApp.get('/pco/teams', pcoController.getTeamsHandler);
    authedApp.post('/pco/teams/:pcoTeamId/link', pcoController.linkTeamHandler);

    // Services / Schedule
    authedApp.post('/pco/sync/services', pcoController.syncServicesHandler);
    authedApp.get('/pco/plans', pcoController.getPlansHandler);
    authedApp.get('/pco/plans/:pcoId/schedule', pcoController.getPlanScheduleHandler);
  });
}
