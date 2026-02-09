import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import * as subscriptionController from '../controllers/subscriptionController';

export async function subscriptionRoutes(app: FastifyInstance) {
  // Webhook — NO auth (comes from RevenueCat)
  app.post('/webhook', subscriptionController.handleWebhook);

  // Authenticated routes
  app.register(async (authedApp) => {
    authedApp.addHook('onRequest', authenticate);
    authedApp.get('/', subscriptionController.getSubscription);
    authedApp.get('/plans', subscriptionController.getPlans);
  });
}
