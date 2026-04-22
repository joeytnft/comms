import { FastifyInstance } from 'fastify';
import { WebhookReceiver } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { getIO } from '../config/socketIO';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  return _supabase;
}

export async function webhookRoutes(app: FastifyInstance) {
  // Keep body as raw string — WebhookReceiver needs it for SHA-256 verification.
  // This parser is scoped to this plugin only and does not affect other routes.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  app.post('/livekit', async (request, reply) => {
    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      return reply.status(400).send({ error: 'LiveKit not configured' });
    }

    const rawBody = request.body as string;
    const authHeader = request.headers['authorization'] ?? '';

    let event;
    try {
      const receiver = new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
      event = await receiver.receive(rawBody, authHeader);
    } catch (err) {
      logger.warn({ err }, '[Webhook] LiveKit signature verification failed');
      return reply.status(401).send({ error: 'Invalid webhook signature' });
    }

    logger.debug({ event: event.event }, '[Webhook] LiveKit event received');

    if (event.event === 'egress_ended' && event.egressInfo) {
      const { egressId, fileResults } = event.egressInfo;
      const fileLocation = fileResults?.[0]?.location;

      if (!fileLocation) {
        logger.debug({ egressId }, '[Webhook] egress_ended has no file result — skipping');
        return reply.status(204).send();
      }

      // Look up userId + groupId from the reverse mapping set when egress started
      const metaRaw = await redis.get(`ptt:egress_meta:${egressId}`);
      if (!metaRaw) {
        logger.debug({ egressId }, '[Webhook] No egress meta found — not a PTT egress');
        return reply.status(204).send();
      }

      let userId: string;
      let groupId: string;
      try {
        ({ userId, groupId } = JSON.parse(metaRaw));
      } catch {
        logger.warn({ egressId }, '[Webhook] Failed to parse egress meta');
        return reply.status(204).send();
      }

      // Construct Supabase public URL from the S3 key
      const { data: { publicUrl } } = getSupabase()
        .storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .getPublicUrl(fileLocation);

      // Find the most recent pttLog for this user+group that still has no audio URL
      const recentLog = await prisma.pttLog.findFirst({
        where: {
          groupId,
          senderId: userId,
          audioUrl: null,
          createdAt: { gte: new Date(Date.now() - 120_000) },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (recentLog) {
        await prisma.pttLog.update({
          where: { id: recentLog.id },
          data: { audioUrl: publicUrl },
        });

        // Emit real-time update so clients update the audio URL without a full refresh
        getIO()?.to(`ptt:${groupId}`).emit('ptt:log_updated', {
          id: recentLog.id,
          groupId,
          audioUrl: publicUrl,
        });

        logger.info({ logId: recentLog.id, egressId }, '[Webhook] Backfilled PTT audio URL via webhook');
      }

      // Clean up the meta key
      await redis.del(`ptt:egress_meta:${egressId}`);
    }

    return reply.status(204).send();
  });
}
