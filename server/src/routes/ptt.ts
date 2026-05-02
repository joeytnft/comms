import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { requireFeature } from '../middleware/subscription';
import * as pttController from '../controllers/pttController';

export async function pttRoutes(app: FastifyInstance) {
  // All PTT routes require auth + PTT feature
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', requireFeature('ptt'));

  // Get LiveKit token to join a group's PTT room
  app.get('/:groupId/token', pttController.getToken);

  // Listen-only token for a lead group room (called by sub-group members during a broadcast)
  app.get('/:groupId/lead-room-token', pttController.getLeadRoomToken);

  // Get participants in a PTT room
  app.get('/:groupId/participants', pttController.getParticipants);

  // Register an ephemeral APNs PTT push token (iOS only)
  app.post('/:groupId/register-token', pttController.registerPushToken);

  // Client-side PTT audio upload (replaces LiveKit egress)
  app.post('/:groupId/audio', pttController.uploadAudio);

  // HTTP replacements for socket events that iOS audio session activation drops.
  // ptt:start / ptt:stop / ptt:native_log arrive via HTTP so a fresh TCP
  // connection is used each time, bypassing the stale WebSocket.
  app.post('/:groupId/start',      pttController.transmitStart);
  app.post('/:groupId/stop',       pttController.transmitStop);
  app.post('/:groupId/native-log', pttController.nativeLog);
}
