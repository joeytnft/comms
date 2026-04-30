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
 * Idempotent — skips silently if an egress is already active for this user+group.
 * Errors are logged but never thrown — egress is a best-effort backup.
 */
export async function startTransmissionEgress(groupId: string, userId: string): Promise<void> {
  const clients = getClients();
  if (!clients) {
    logger.warn('[LiveKit] Egress skipped — LIVEKIT_URL/API_KEY/API_SECRET not configured');
    return;
  }
  const output = buildOutput(groupId, userId);
  if (!output) return;

  // Idempotency guard — one egress per user per group at a time.
  // We verify the stored egress is still alive before skipping: a quick start/stop
  // race (or a crash) can leave a stale key for up to 1 hour, silently blocking all
  // future recordings.
  const egressKey = `ptt:egress:${userId}:${groupId}`;
  const existing  = await redis.get(egressKey);
  if (existing) {
    try {
      const list = await clients.egress.listEgress({ egressId: existing });
      const info = list[0];
      const TERMINAL = new Set([
        EgressStatus.EGRESS_COMPLETE,
        EgressStatus.EGRESS_FAILED,
        EgressStatus.EGRESS_ABORTED,
        EgressStatus.EGRESS_LIMIT_REACHED,
        // EGRESS_ENDING: stopEgress was already called and LiveKit is wrapping
        // up. Treat as stale so a rapid stop/start cycle starts fresh egress
        // rather than silently skipping the new transmission's recording.
        EgressStatus.EGRESS_ENDING,
      ]);
      const isStale = !info || TERMINAL.has(info.status);
      if (!isStale) {
        logger.debug(`[LiveKit] Egress already active for ${userId}/${groupId} (${existing}) — skipping`);
        return;
      }
      logger.info(`[LiveKit] Stale egress key for ${userId}/${groupId} (status: ${info?.status ?? 'not found'}) — clearing and restarting`);
      await redis.del(egressKey);
    } catch (verifyErr) {
      logger.warn({ err: verifyErr }, '[LiveKit] Could not verify existing egress — clearing stale key and restarting');
      await redis.del(egressKey);
    }
  }

  try {
    const roomName = `ptt:${groupId}`;
    const trackSid = await findAudioTrackSid(clients.rooms, roomName, userId);

    if (!trackSid) {
      logger.warn(`[LiveKit] No published audio track for ${userId} in ${roomName} after ${TRACK_POLL_TIMEOUT_MS}ms — egress skipped`);
      return;
    }

    logger.info(`[LiveKit] Starting egress for ${userId} in ${roomName}, track ${trackSid}, bucket ${env.SUPABASE_PTT_BUCKET}`);
    const egress = await clients.egress.startTrackCompositeEgress(
      roomName,
      output,
      { audioTrackId: trackSid },
    );

    const egressStartedAt = new Date().toISOString();
    await redis.setex(`ptt:egress:${userId}:${groupId}`, 3600, egress.egressId);
    await redis.setex(`ptt:egress_meta:${egress.egressId}`, 3600, JSON.stringify({ userId, groupId, startedAt: egressStartedAt }));
    logger.info(`[LiveKit] Egress ${egress.egressId} started OK`);
  } catch (err) {
    logger.warn({ err }, '[LiveKit] startTransmissionEgress failed — continuing without egress');
  }
}

/**
 * Stop the LiveKit egress for this transmission.
 * Cleans up the Redis key regardless of whether the stop call succeeds.
 */
export async function stopTransmissionEgress(userId: string, groupId: string): Promise<void> {
  const clients = getClients();
  if (!clients) return;

  const egressId = await redis.get(`ptt:egress:${userId}:${groupId}`);
  if (!egressId) return;

  try {
    await clients.egress.stopEgress(egressId);
    logger.info(`[LiveKit] Egress ${egressId} stopped`);
  } catch (err) {
    logger.warn({ err, egressId }, '[LiveKit] stopEgress failed');
  } finally {
    await redis.del(`ptt:egress:${userId}:${groupId}`);
  }
}
