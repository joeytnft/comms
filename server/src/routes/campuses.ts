import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { requireFeature } from '../middleware/subscription';
import * as ctrl from '../controllers/campusController';

export async function campusRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', requireFeature('multiCampus'));

  // Campus CRUD
  app.get('/', ctrl.listCampuses);
  app.post('/', ctrl.createCampus);
  app.get('/:id', ctrl.getCampus);
  app.patch('/:id', ctrl.updateCampus);
  app.delete('/:id', ctrl.deleteCampus);

  // Campus members
  app.get('/:id/members', ctrl.getCampusMembers);
  app.post('/:id/members', ctrl.assignUserToCampus);
  app.delete('/:id/members/:userId', ctrl.removeUserFromCampus);

  // All org members with campus assignments (for admin UI)
  app.get('/org-members', ctrl.getOrgMembers);
}
