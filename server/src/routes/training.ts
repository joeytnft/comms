import { FastifyInstance } from 'fastify';
import {
  listTrainings,
  getTraining,
  createTraining,
  updateTraining,
  deleteTraining,
  signUpForTraining,
  cancelSignup,
  listSignups,
} from '../controllers/trainingController';

export async function trainingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    await request.jwtVerify();
    const payload = request.user as { userId: string; organizationId: string };
    request.userId = payload.userId;
    request.organizationId = payload.organizationId;
  });

  // Training events
  app.get('/', listTrainings);
  app.post('/', createTraining);
  app.get('/:id', getTraining);
  app.put('/:id', updateTraining);
  app.delete('/:id', deleteTraining);

  // Signup management
  app.post('/:id/signup', signUpForTraining);
  app.delete('/:id/signup', cancelSignup);
  app.get('/:id/signups', listSignups);
}
