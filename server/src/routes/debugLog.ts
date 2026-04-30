import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

interface DebugLogBody {
  tag?: string;
  message?: string;
  payload?: Record<string, unknown>;
  ts?: number;
}

/**
 * Lightweight client-log forwarder.
 *
 * Authenticated devices POST PTT lifecycle events here so we can correlate
 * the iOS PTChannelManagerDelegate callback timing with the existing server
 * log lines (egress start/stop, beginTransmission/endTransmission). Every
 * line lands in the regular pino stream, prefixed with [ClientPTT] for easy
 * grepping in Railway.
 *
 * Intended for debug builds and short-lived production diagnostic windows
 * — there's no rate-limit beyond Fastify's global limit, so leaving this
 * permanently on at high event volume isn't free.
 */
export async function debugLogRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  app.post(
    '/',
    async (request: FastifyRequest<{ Body: DebugLogBody }>, reply) => {
      const { tag, message, payload, ts } = request.body ?? {};
      const safeTag     = typeof tag === 'string' ? tag.slice(0, 64) : 'untagged';
      const safeMessage = typeof message === 'string' ? message.slice(0, 1024) : '';
      const clientTs    = typeof ts === 'number' && Number.isFinite(ts) ? ts : null;

      logger.info(
        {
          userId: request.userId,
          orgId:  request.organizationId,
          tag:    safeTag,
          clientTs,
          payload: payload && typeof payload === 'object' ? payload : undefined,
        },
        `[ClientPTT] ${safeMessage}`,
      );

      reply.status(204).send();
    },
  );
}
