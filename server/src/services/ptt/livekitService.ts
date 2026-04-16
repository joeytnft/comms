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
  const { SUPABASE_S3_KEY_ID, SUPABASE_S3_ACCESS_SECRET, SUPABASE_URL, SUPABASE_STORAGE_BUCKET } = env;
  if (!SUPABASE_S3_KEY_ID || !SUPABASE_S3_ACCESS_SECRET) return null;

  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    // {time} is substituted by LiveKit with the Unix timestamp at egress start
    filepath: `ptt/${groupId}/${userId}_{time}.mp4`,
    disableManifest: true,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey:      SUPABASE_S3_KEY_ID,
        secret:         SUPABASE_S3_ACCESS_SECRET,
        region:         'us-east-1',
        endpoint:       `${SUPABASE_URL}/storage/v1/s3`,
        bucket:         SUPABASE_STORAGE_BUCKET,
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
  const output  = clients ? buildOutput(groupId, userId) : null;
  if (!clients || !output) return;

  try {
    const roomName     = `ptt:${groupId}`;
    const participants = await clients.rooms.listParticipants(roomName);
    const participant  = participants.find((p) => p.identity === userId);
    const audioTrack   = participant?.tracks.find((t) => t.type === TrackType.AUDIO);

    if (!audioTrack?.sid) {
      logger.debug(`[LiveKit] No audio track found for ${userId} in ${roomName} — skipping egress`);
      return;
    }

    const egress = await clients.egress.startTrackCompositeEgress(
      roomName,
      output,
      audioTrack.sid,   // audioTrackId
    );

    await redis.setex(`ptt:egress:${userId}:${groupId}`, 3600, egress.egressId);
    logger.info(`[LiveKit] Egress ${egress.egressId} started for ${userId} in ${roomName}`);
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
