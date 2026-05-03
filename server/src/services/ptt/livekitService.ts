import {
  EgressClient,
  RoomServiceClient,
  EncodedFileOutput,
  EncodedFileType,
  EgressStatus,
  S3Upload,
  TrackType,
} from 'livekit-server-sdk';
import { redis } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

function getClients(): { egress: EgressClient; rooms: RoomServiceClient } | null {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
  return {
    egress: new EgressClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET),
    rooms:  new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET),
  };
}

function buildOutput(groupId: string, userId: string): EncodedFileOutput | null {
  const { SUPABASE_S3_KEY_ID, SUPABASE_S3_ACCESS_SECRET, SUPABASE_URL, SUPABASE_PTT_BUCKET } = env;
  if (!SUPABASE_S3_KEY_ID || !SUPABASE_S3_ACCESS_SECRET) {
    logger.warn('[LiveKit] Egress skipped — SUPABASE_S3_KEY_ID or SUPABASE_S3_ACCESS_SECRET not set');
    return null;
  }

  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    // {time} is substituted by LiveKit with the Unix timestamp at egress start
    filepath: `${groupId}/${userId}_{time}.mp4`,
    disableManifest: true,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey:      SUPABASE_S3_KEY_ID,
        secret:         SUPABASE_S3_ACCESS_SECRET,
        region:         env.SUPABASE_S3_REGION,
        endpoint:       env.SUPABASE_S3_ENDPOINT || `${SUPABASE_URL}/storage/v1/s3`,
        bucket:         SUPABASE_PTT_BUCKET,
        forcePathStyle: true,
      }),
    },
  });
}

// How long to keep retrying listParticipants when the track hasn't appeared yet.
// The mic track can take a few hundred ms to propagate after publish.
const TRACK_POLL_INTERVAL_MS = 300;
const TRACK_POLL_TIMEOUT_MS  = 5000;

// Sentinel stored in the egress Redis key while startTransmissionEgress is
// in progress (between claiming the slot and receiving the egress ID from
// LiveKit). Allows stopTransmissionEgress to cancel an in-flight start by
// deleting the key — the start function checks the session key afterward
// and aborts if the transmission already ended.
const EGRESS_PENDING = '__pending__';

async function findAudioTrackSid(
  rooms: RoomServiceClient,
  roomName: string,
  userId: string,
): Promise<string | null> {
  const deadline = Date.now() + TRACK_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const participants = await rooms.listParticipants(roomName);
    const participant  = participants.find((p) => p.identity === userId);
    const audioTrack   = participant?.tracks.find((t) => t.type === TrackType.AUDIO);
    if (audioTrack?.sid) return audioTrack.sid;
    await new Promise((r) => setTimeout(r, TRACK_POLL_INTERVAL_MS));
  }
  return null;
}

/**
 * Start a LiveKit TrackCompositeEgress for the transmitting user's audio track.
 * Stores the egress ID in Redis so stopTransmissionEgress can find it.
 * Idempotent — skips silently if an egress is already active or starting for
 * this user+group. Errors are logged but never thrown — egress is best-effort.
 *
 * Race-condition safety: we write the EGRESS_PENDING sentinel to the Redis key
 * BEFORE polling for the track. This blocks a concurrent call from also seeing
 * an empty key and starting a second egress (the TOCTOU window that previously
 * caused two concurrent egresses and hit the LiveKit limit). After the slow
 * track-poll, we also verify the transmission session is still active; if
 * endTransmission already ran while we were polling, we abort cleanly.
 */
export async function startTransmissionEgress(groupId: string, userId: string): Promise<void> {
  const clients = getClients();
  if (!clients) {
    logger.warn('[LiveKit] Egress skipped — LIVEKIT_URL/API_KEY/API_SECRET not configured');
    return;
  }
  const output = buildOutput(groupId, userId);
  if (!output) return;

  const egressKey = `ptt:egress:${userId}:${groupId}`;

  // Atomically claim the egress slot. SET NX means only one concurrent caller
  // can proceed; the 60s TTL covers the track-poll window + API round-trip.
  // If the claim fails, inspect the existing value to decide what to do.
  const claimed = await redis.set(egressKey, EGRESS_PENDING, 'EX', 60, 'NX');
  if (!claimed) {
    const existing = await redis.get(egressKey);

    if (!existing || existing === EGRESS_PENDING) {
      // Another startTransmissionEgress call is already in progress.
      logger.debug(`[LiveKit] Egress start already in progress for ${userId}/${groupId} — skipping`);
      return;
    }

    // Real egress ID present — verify it's still alive before skipping.
    // A crash or rapid stop/start can leave a stale key for up to 1 hour.
    try {
      const list = await clients.egress.listEgress({ egressId: existing });
      const info = list[0];
      const TERMINAL = new Set([
        EgressStatus.EGRESS_COMPLETE,
        EgressStatus.EGRESS_FAILED,
        EgressStatus.EGRESS_ABORTED,
        EgressStatus.EGRESS_LIMIT_REACHED,
        EgressStatus.EGRESS_ENDING,
      ]);
      if (!info || TERMINAL.has(info.status)) {
        logger.info(`[LiveKit] Stale egress for ${userId}/${groupId} (${info?.status ?? 'not found'}) — clearing and restarting`);
        await redis.del(egressKey);
        const retryClaimed = await redis.set(egressKey, EGRESS_PENDING, 'EX', 60, 'NX');
        if (!retryClaimed) return; // Lost the race on retry — give up
      } else {
        logger.debug(`[LiveKit] Egress already active for ${userId}/${groupId} (${existing}) — skipping`);
        return;
      }
    } catch (verifyErr) {
      logger.warn({ err: verifyErr }, '[LiveKit] Could not verify existing egress — skipping start to avoid duplicate');
      return;
    }
  }

  try {
    const roomName = `ptt:${groupId}`;
    const trackSid = await findAudioTrackSid(clients.rooms, roomName, userId);

    if (!trackSid) {
      logger.warn(`[LiveKit] No published audio track for ${userId} in ${roomName} after ${TRACK_POLL_TIMEOUT_MS}ms — egress skipped`);
      await redis.del(egressKey);
      return;
    }

    // Guard: transmission may have ended while we were polling for the track.
    // If the session key is gone, endTransmission already ran — abort so we
    // don't start an egress for a transmission that's already over.
    const sessionActive = await redis.exists(`ptt:session:${userId}:${groupId}`);
    if (!sessionActive) {
      logger.info(`[LiveKit] Transmission ended before egress could start for ${userId}/${groupId} — aborting`);
      await redis.del(egressKey);
      return;
    }

    logger.info(`[LiveKit] Starting egress for ${userId} in ${roomName}, track ${trackSid}, bucket ${env.SUPABASE_PTT_BUCKET}`);
    const egress = await clients.egress.startTrackCompositeEgress(
      roomName,
      output,
      { audioTrackId: trackSid },
    );

    const egressStartedAt = new Date().toISOString();
    await redis.setex(egressKey, 3600, egress.egressId);
    await redis.setex(`ptt:egress_meta:${egress.egressId}`, 3600, JSON.stringify({ userId, groupId, startedAt: egressStartedAt }));
    logger.info(`[LiveKit] Egress ${egress.egressId} started OK`);
  } catch (err) {
    logger.warn({ err }, '[LiveKit] startTransmissionEgress failed — continuing without egress');
    await redis.del(egressKey); // release the slot so the next transmission can try
  }
}

/**
 * Stop the LiveKit egress for this transmission.
 * Cleans up the Redis key regardless of whether the stop call succeeds.
 *
 * If the key holds the EGRESS_PENDING sentinel (startTransmissionEgress is
 * still mid-flight), we delete the slot and return. The in-flight start will
 * check the session key after its track-poll and abort when it finds the
 * session gone — so no orphaned egress is created.
 */
export async function stopTransmissionEgress(userId: string, groupId: string): Promise<void> {
  const clients = getClients();
  if (!clients) return;

  const egressKey = `ptt:egress:${userId}:${groupId}`;
  const egressId  = await redis.get(egressKey);
  if (!egressId) return;

  if (egressId === EGRESS_PENDING) {
    await redis.del(egressKey);
    return;
  }

  try {
    await clients.egress.stopEgress(egressId);
    logger.info(`[LiveKit] Egress ${egressId} stopped`);
  } catch (err) {
    logger.warn({ err, egressId }, '[LiveKit] stopEgress failed');
  } finally {
    await redis.del(egressKey);
  }
}
