/**
 * transmissionService — shared business logic for PTT begin/end transmission.
 *
 * Both socket.io handlers (pttSocket.ts) and HTTP controllers (pttController.ts)
 * delegate to this module so the broadcast / APNs / Redis / egress side-effects
 * stay identical regardless of how the user signaled the transmission.
 *
 * Authorization is the caller's responsibility — pass an already-resolved
 * displayName. Each call site has its own access-check rules (the socket path
 * uses canUserAccessGroup which honors LEAD-group inheritance; the HTTP path
 * uses assertGroupAccess for direct membership). Don't move that logic in here
 * without a migration plan.
 */

import { prisma } from '../../config/database';
import { redis } from '../../config/redis';
import { getIO } from '../../config/socketIO';
import { logger } from '../../utils/logger';
import {
  notifyTransmissionStarted,
  notifyTransmissionStopped,
} from '../apns/pttPushService';
import {
  startTransmissionEgress,
  stopTransmissionEgress,
} from './livekitService';

const SESSION_TTL = 7200; // 2-hour safety net for stale Redis keys

export interface TransmissionContext {
  groupId: string;
  userId: string;
  displayName: string;
}

export interface BeginOptions {
  /** mime type the client will send chunks under (web path only). */
  mimeType?: string;
  /**
   * Socket IDs to exclude from the ptt:speaking broadcast.
   *  - socket transport passes the originating socket id (so the sender
   *    doesn't see their own echo).
   *  - HTTP transport passes every socket owned by the user (the sender's
   *    other devices already know they're transmitting).
   */
  excludeSocketIds?: string[];
}

export interface EndOptions {
  /** Same semantics as BeginOptions.excludeSocketIds. */
  excludeSocketIds?: string[];
}

const room = (groupId: string) => `ptt:${groupId}`;
const sessionKey = (userId: string, groupId: string) => `ptt:session:${userId}:${groupId}`;
const chunksKey  = (userId: string, groupId: string) => `ptt:chunks:${userId}:${groupId}`;

/**
 * Begin a transmission. Idempotent: if a session is already active for this
 * user+group, the duplicate call is dropped without re-broadcasting or
 * re-starting egress. The Redis session key TTL handles eventual cleanup.
 */
export async function beginTransmission(
  ctx: TransmissionContext,
  opts: BeginOptions = {},
): Promise<{ alreadyActive: boolean }> {
  const { groupId, userId, displayName } = ctx;
  const mimeType = opts.mimeType ?? 'audio/webm';

  // Idempotency: if the session key already exists, the user is already
  // transmitting (e.g. iOS HTTP fallback racing with the socket emit, or a
  // double-tap producing two start events). Skip the second call entirely so
  // we don't double-broadcast ptt:speaking, double-fire APNs, or attempt to
  // start a second egress (LiveKit returns "already running" but logs noise).
  const wasActive = await redis.exists(sessionKey(userId, groupId));
  if (wasActive > 0) {
    logger.info(
      { userId, groupId },
      '[PTT] beginTransmission: duplicate ignored — session already active',
    );
    return { alreadyActive: true };
  }

  const startedAt = new Date().toISOString();

  // Persist session metadata + clear any stale chunks from a prior session.
  // Both keys get a 2-hour TTL so Redis self-cleans if endTransmission never fires.
  const pipeline = redis.pipeline();
  pipeline.hset(sessionKey(userId, groupId), { startedAt: Date.now(), mimeType });
  pipeline.expire(sessionKey(userId, groupId), SESSION_TTL);
  pipeline.del(chunksKey(userId, groupId));
  await pipeline.exec();

  const io = getIO();
  if (io) {
    const target = (opts.excludeSocketIds && opts.excludeSocketIds.length > 0)
      ? io.to(room(groupId)).except(opts.excludeSocketIds)
      : io.to(room(groupId));
    target.emit('ptt:speaking', { groupId, userId, displayName, startedAt });
  }

  // Surface sub-group transmissions to the parent LEAD room so lead members
  // see the active speaker indicator without having to be in the sub-group.
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { parentGroupId: true },
  });
  if (group?.parentGroupId && io) {
    const target = (opts.excludeSocketIds && opts.excludeSocketIds.length > 0)
      ? io.to(room(group.parentGroupId)).except(opts.excludeSocketIds)
      : io.to(room(group.parentGroupId));
    target.emit('ptt:speaking', {
      groupId, userId, displayName, startedAt, fromSubGroup: true,
    });
  }

  // Wake offline members via APNs PTT push. We exclude online members by
  // socket presence, not exclude socket IDs: a user with a backgrounded socket
  // still needs the wake-up.
  try {
    const socketsInRoom = await (io?.in(room(groupId)).fetchSockets() ?? Promise.resolve([]));
    const onlineIds = new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socketsInRoom.map((s) => (s as any).user?.userId as string | undefined)
        .filter((id): id is string => typeof id === 'string'),
    );
    const pushTokens = await prisma.pttPushToken.findMany({
      where: { groupId, NOT: { userId: { in: [...onlineIds] } } },
      select: { token: true },
    });
    if (pushTokens.length > 0) {
      notifyTransmissionStarted(
        pushTokens.map((t) => t.token),
        groupId, userId, displayName,
      ).catch((err) => logger.error({ err }, '[PTT] APNs notify start failed'));
    }
  } catch (err) {
    logger.warn({ err }, '[PTT] beginTransmission: APNs lookup failed');
  }

  startTransmissionEgress(groupId, userId).catch(
    (err) => logger.warn({ err, userId, groupId }, '[PTT] Egress start failed'),
  );

  logger.info({ userId, groupId, mimeType }, '[PTT] beginTransmission ok');
  return { alreadyActive: false };
}

/**
 * End a transmission. Idempotent: if no session is active, the call is a
 * no-op (no broadcast, no APNs, no egress stop). This guards against the
 * common case where the iOS HTTP fallback fires ptt:stop after the socket
 * disconnect handler already cleaned up the same session.
 */
export async function endTransmission(
  ctx: TransmissionContext,
  opts: EndOptions = {},
): Promise<{ wasActive: boolean }> {
  const { groupId, userId } = ctx;

  const wasActive = await redis.exists(sessionKey(userId, groupId));
  if (wasActive === 0) {
    logger.info(
      { userId, groupId },
      '[PTT] endTransmission: no active session — nothing to do',
    );
    return { wasActive: false };
  }

  const endedAt = new Date().toISOString();

  const io = getIO();
  if (io) {
    const target = (opts.excludeSocketIds && opts.excludeSocketIds.length > 0)
      ? io.to(room(groupId)).except(opts.excludeSocketIds)
      : io.to(room(groupId));
    target.emit('ptt:stopped', { groupId, userId, endedAt });
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { parentGroupId: true },
  });
  if (group?.parentGroupId && io) {
    const target = (opts.excludeSocketIds && opts.excludeSocketIds.length > 0)
      ? io.to(room(group.parentGroupId)).except(opts.excludeSocketIds)
      : io.to(room(group.parentGroupId));
    target.emit('ptt:stopped', { groupId, userId, endedAt, fromSubGroup: true });
  }

  try {
    const pushTokens = await prisma.pttPushToken.findMany({
      where: { groupId },
      select: { token: true },
    });
    if (pushTokens.length > 0) {
      notifyTransmissionStopped(
        pushTokens.map((t) => t.token), groupId,
      ).catch((err) => logger.error({ err }, '[PTT] APNs notify stop failed'));
    }
  } catch (err) {
    logger.warn({ err }, '[PTT] endTransmission: APNs lookup failed');
  }

  stopTransmissionEgress(userId, groupId).catch(
    (err) => logger.warn({ err, userId, groupId }, '[PTT] Egress stop failed'),
  );

  logger.info({ userId, groupId }, '[PTT] endTransmission ok');
  return { wasActive: true };
}
