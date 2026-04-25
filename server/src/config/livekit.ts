import { AccessToken } from 'livekit-server-sdk';
import { env } from './env';

/**
 * Generate a LiveKit access token for a user to join a room.
 * Room names follow the pattern: `ptt:<groupId>`
 */
export async function generateLiveKitToken(
  userId: string,
  displayName: string,
  groupId: string,
  canPublish = true,
): Promise<string> {
  const roomName = `ptt:${groupId}`;

  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: userId,
    name: displayName,
    ttl: '6h',
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish,
    canSubscribe: true,
    canPublishData: canPublish,
  });

  return token.toJwt();
}

export function getRoomName(groupId: string): string {
  return `ptt:${groupId}`;
}
