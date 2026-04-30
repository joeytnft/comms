/**
 * /debug-log — client-side PTT diagnostic log forwarder.
 *
 * Authenticated devices POST PTT lifecycle events here so we can correlate
 * iOS PTChannelManagerDelegate timing, Live Activity transitions, and socket
 * reconnect events with the existing server log lines (egress start/stop,
 * beginTransmission/endTransmission). Every line lands in the pino stream
 * prefixed with [DiagPTT] for easy grepping in Railway.
 *
 * Every event is also written into a Redis ring-buffer keyed by the client's
 * stable SESSION_ID (last 500 events, 24-hour TTL). Retrieve a full session
 * via GET /debug-log/session/:sessionId without needing Railway access.
 *
 * Endpoints:
 *   POST /             — single event (legacy, backward-compat)
 *   POST /batch        — array of events in one request (preferred)
 *   GET  /session/:id  — retrieve stored events for a session (own sessions only)
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { redis } from '../config/redis';

// Ring-buffer limits per session in Redis.
const SESSION_LOG_MAX = 500;
const SESSION_LOG_TTL = 86_400; // 24 h

interface DiagEvent {
  tag?: unknown;
  message?: unknown;
  payload?: unknown;
  ts?: unknown;
  sessionId?: unknown;
}

interface BatchBody {
  events?: unknown;
  context?: unknown;
}

function sanitiseEvent(event: DiagEvent) {
  return {
    tag:       typeof event.tag === 'string'     ? event.tag.slice(0, 64)     : 'untagged',
    message:   typeof event.message === 'string' ? event.message.slice(0, 1024) : '',
    clientTs:  typeof event.ts === 'number' && Number.isFinite(event.ts as number) ? event.ts as number : null,
    sessionId: typeof event.sessionId === 'string' ? event.sessionId.slice(0, 64) : null,
    payload:   event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
      ? event.payload as Record<string, unknown>
      : undefined,
  };
}

function writeEvent(
  raw: DiagEvent,
  context: Record<string, unknown>,
  userId: string,
  orgId: string,
) {
  const e = sanitiseEvent(raw);

  logger.info(
    {
      userId,
      orgId,
      tag:       e.tag,
      sessionId: e.sessionId,
      clientTs:  e.clientTs,
      ...(Object.keys(context).length ? { deviceCtx: context } : {}),
      ...(e.payload ? { payload: e.payload } : {}),
    },
    `[DiagPTT] ${e.message}`,
  );

  // Store in Redis ring-buffer keyed by sessionId for later retrieval.
  if (e.sessionId) {
    const key   = `diag:session:${e.sessionId}`;
    const entry = JSON.stringify({
      tag:      e.tag,
      message:  e.message,
      clientTs: e.clientTs,
      payload:  e.payload,
      userId,
    });
    redis.rpush(key, entry)
      .then((len) => {
        if (len === 1) redis.expire(key, SESSION_LOG_TTL).catch(() => null);
        else if (len > SESSION_LOG_MAX) redis.ltrim(key, -SESSION_LOG_MAX, -1).catch(() => null);
      })
      .catch(() => null);
  }
}

export async function debugLogRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  // ── POST / — single event (legacy backward-compat) ─────────────────────────
  app.post(
    '/',
    async (request: FastifyRequest<{ Body: DiagEvent }>, reply) => {
      writeEvent(request.body ?? {}, {}, request.userId, request.organizationId);
      reply.status(204).send();
    },
  );

  // ── POST /batch — preferred: sends all queued events in one round-trip ──────
  app.post(
    '/batch',
    async (request: FastifyRequest<{ Body: BatchBody }>, reply) => {
      const { events, context } = request.body ?? {};
      const ctx: Record<string, unknown> =
        context && typeof context === 'object' && !Array.isArray(context)
          ? (context as Record<string, unknown>)
          : {};

      if (Array.isArray(events)) {
        // Cap per-batch to prevent accidental log floods.
        for (const event of (events as DiagEvent[]).slice(0, 100)) {
          writeEvent(event, ctx, request.userId, request.organizationId);
        }
      }
      reply.status(204).send();
    },
  );

  // ── GET /session/:sessionId — retrieve stored events ───────────────────────
  // Callers can only read their own sessions (userId is checked against the
  // first stored event — all events in a session share the same userId).
  app.get(
    '/session/:sessionId',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply) => {
      const { sessionId } = request.params;
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64) {
        return reply.status(400).send({ error: 'Invalid sessionId' });
      }

      const raw = await redis.lrange(`diag:session:${sessionId}`, 0, -1);
      if (raw.length === 0) {
        return reply.send({ sessionId, events: [], count: 0 });
      }

      // Ownership check: compare the userId embedded in the first stored entry
      // against the authenticated caller. Prevents session enumeration.
      let ownerUserId: string | null = null;
      try { ownerUserId = (JSON.parse(raw[0]) as { userId?: string }).userId ?? null; }
      catch { /* malformed — deny */ }
      if (!ownerUserId || ownerUserId !== request.userId) {
        return reply.status(403).send({ error: 'FORBIDDEN' });
      }

      const events = raw.map((r) => {
        try { return JSON.parse(r) as Record<string, unknown>; }
        catch { return null; }
      }).filter(Boolean);

      return reply.send({ sessionId, events, count: events.length });
    },
  );
}
