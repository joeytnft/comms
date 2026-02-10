import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import * as messageController from '../controllers/messageController';

export async function messageRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  // Messages are scoped under /groups/:groupId/messages
  app.get('/:groupId/messages', messageController.getMessages);
  app.post('/:groupId/messages', messageController.sendMessage);
  app.post('/:groupId/messages/read', messageController.markRead);
}
