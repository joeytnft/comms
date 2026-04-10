import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import * as responsePlanController from '../controllers/responsePlanController';

export async function responsePlanRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  app.get('/', responsePlanController.listPlans);
  app.post('/', responsePlanController.createPlan);
  app.patch('/:id', responsePlanController.updatePlan);
  app.delete('/:id', responsePlanController.deletePlan);
}
