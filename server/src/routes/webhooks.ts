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
  // LiveKit sends Content-Type: application/webhook+json (not application/json).
  // Must be parsed as raw string — WebhookReceiver needs it for SHA-256 verification.
  // This parser is scoped to this plugin only and does not affect other routes.
  app.addContentTypeParser('application/webhook+json', { parseAs: 'string' }, (_req, body, done) => {
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
      const rawLocation = fileResults?.[0]?.location ?? '';

      logger.info({ egressId, rawLocation, fileResultCount: fileResults?.length ?? 0 }, '[Webhook] egress_ended received');

      if (!rawLocation) {
        logger.warn({ egressId }, '[Webhook] egress_ended has no file location — recording may be empty or S3 upload failed');
        return reply.status(204).send();
      }

      // Look up userId + groupId from the reverse mapping set when egress started
      const metaRaw = await redis.get(`ptt:egress_meta:${egressId}`);
      if (!metaRaw) {
        logger.warn({ egressId }, '[Webhook] No egress meta in Redis — egress may have started before this deploy or TTL expired');
        return reply.status(204).send();
      }

      let userId: string;
      let groupId: string;
      let startedAt: string | undefined;
      try {
        ({ userId, groupId, startedAt } = JSON.parse(metaRaw));
      } catch {
        logger.warn({ egressId }, '[Webhook] Failed to parse egress meta');
        return reply.status(204).send();
      }

      // Extract the bucket-relative path from whatever format LiveKit delivers:
      //   s3://bucket-name/path/file.mp4  (direct S3)
      //   https://<project>.storage.supabase.co/storage/v1/s3/<bucket>/path/file.mp4  (Supabase S3 endpoint)
      // Supabase getPublicUrl expects only the bucket-relative path.
      let storagePath = rawLocation;
      if (storagePath.startsWith('s3://')) {
        storagePath = storagePath.replace(/^s3:\/\/[^/]+\//, '');
      } else if (storagePath.includes('/storage/v1/s3/')) {
        const match = storagePath.match(/\/storage\/v1\/s3\/[^/]+\/(.+)$/);
        if (match) storagePath = match[1];
      }

      logger.info({ egressId, userId, groupId, storagePath }, '[Webhook] Building signed URL for PTT recording');

      // Signed URL with TTL — bucket is configured private. Recipients
      // re-fetch logs from the API to refresh the URL when needed.
      const { data: signed, error: signErr } = await getSupabase()
        .storage
        .from(env.SUPABASE_PTT_BUCKET)
        .createSignedUrl(storagePath, 60 * 60 * 6);
      if (signErr || !signed?.signedUrl) {
        logger.warn({ err: signErr, egressId, storagePath }, '[Webhook] Failed to create signed URL');
        return reply.status(204).send();
      }
      const audioUrl = signed.signedUrl;

      // Match the pttLog that belongs to THIS egress, not a later one.
      // When startedAt is available (stored since the fix), use a tight window
      // around the transmission start time and pick the OLDEST matching row
      // (asc order). Without startedAt, fall back to the prior 5-minute window.
      // The orderBy was previously 'desc' which caused late egress_ended webhooks
      // to backfill the NEWEST (wrong) log when the user transmitted twice rapidly.
      const windowStart = startedAt
        ? new Date(new Date(startedAt).getTime() - 30_000)
        : new Date(Date.now() - 300_000);
      const windowEnd = startedAt
        ? new Date(new Date(startedAt).getTime() + 300_000)
        : new Date();
      const recentLog = await prisma.pttLog.findFirst({
        where: {
          groupId,
          senderId: userId,
          audioUrl: null,
          createdAt: { gte: windowStart, lte: windowEnd },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (recentLog) {
        await prisma.pttLog.update({
          where: { id: recentLog.id },
          data: { audioUrl },
        });

        getIO()?.to(`ptt:${groupId}`).emit('ptt:log_updated', {
          id: recentLog.id,
          groupId,
          audioUrl,
        });

        logger.info({ logId: recentLog.id, egressId }, '[Webhook] Backfilled PTT audio URL');
      } else {
        logger.warn({ egressId, userId, groupId }, '[Webhook] No matching pttLog found within 5 minutes — audio URL not backfilled');
      }

      await redis.del(`ptt:egress_meta:${egressId}`);
    }

    return reply.status(204).send();
  });
}
