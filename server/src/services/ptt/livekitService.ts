import {
  EgressClient,
  RoomServiceClient,
  EncodedFileOutput,
  EncodedFileType,
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

/**
 * Start a LiveKit TrackCompositeEgress for the transmitting user's audio track.
 * Stores the egress ID in Redis so stopTransmissionEgress can find it.
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

  try {
    const roomName     = `ptt:${groupId}`;
    const participants = await clients.rooms.listParticipants(roomName);
    const participant  = participants.find((p) => p.identity === userId);
    const audioTrack   = participant?.tracks.find((t) => t.type === TrackType.AUDIO);

    if (!audioTrack?.sid) {
      logger.warn(`[LiveKit] No published audio track for ${userId} in ${roomName} — egress skipped. Check mic track is published before ptt:start fires.`);
      return;
    }

    logger.info(`[LiveKit] Starting egress for ${userId} in ${roomName}, track ${audioTrack.sid}, bucket ${env.SUPABASE_PTT_BUCKET}, region ${env.SUPABASE_S3_REGION}`);
    const egress = await clients.egress.startTrackCompositeEgress(
      roomName,
      output,
      audioTrack.sid,
    );

    await redis.setex(`ptt:egress:${userId}:${groupId}`, 3600, egress.egressId);
    await redis.setex(`ptt:egress_meta:${egress.egressId}`, 3600, JSON.stringify({ userId, groupId }));
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
