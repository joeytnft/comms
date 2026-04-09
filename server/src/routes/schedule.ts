import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import * as ctrl from '../controllers/scheduleController';

export async function scheduleRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  // Templates (recurring schedules)
  app.get('/templates', ctrl.listTemplates);
  app.post('/templates', ctrl.createTemplate);
  app.patch('/templates/:id', ctrl.updateTemplate);
  app.delete('/templates/:id', ctrl.deleteTemplate);
  app.post('/templates/:id/generate', ctrl.generateFromTemplate);
  app.post('/templates/:id/role-slots', ctrl.addRoleSlot);
  app.delete('/templates/:id/role-slots/:slotId', ctrl.removeRoleSlot);

  // Posts
  app.get('/posts', ctrl.listPosts);
  app.post('/posts', ctrl.createPost);
  app.delete('/posts/:id', ctrl.deletePost);

  // Services
  app.get('/services', ctrl.listServices);
  app.get('/services/today', ctrl.getTodayServices);
  app.get('/services/:id', ctrl.getService);
  app.post('/services', ctrl.createService);
  app.patch('/services/:id', ctrl.updateService);
  app.delete('/services/:id', ctrl.deleteService);

  // Assignments (admin)
  app.post('/services/:id/assignments', ctrl.assignUser);
  app.delete('/services/:id/assignments/:assignmentId', ctrl.removeAssignment);

  // My assignment for a service
  app.get('/services/:id/my-assignment', ctrl.getMyAssignment);

  // Availability
  app.put('/services/:id/availability', ctrl.setAvailability);
  app.get('/services/:id/availability', ctrl.getAvailability);

  // Accept / decline assignment
  app.patch('/assignments/:assignmentId/respond', ctrl.respondToAssignment);

  // Push token registration
  app.put('/push-token', ctrl.registerPushToken);

  // Check-in
  app.post('/check-in/:assignmentId', ctrl.checkIn);
  app.post('/check-out/:assignmentId', ctrl.checkOut);

  // Swap requests
  app.post('/swap-requests/:assignmentId', ctrl.requestSwap);
  app.patch('/swap-requests/:id/respond', ctrl.respondToSwap);
  app.get('/swap-requests', ctrl.listSwapRequests);
}
