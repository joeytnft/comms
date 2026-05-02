import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';

export interface PTTSubGroupRoom {
  groupId: string;
  groupName: string;
  token: string;
  roomName: string;
}

export interface PTTTokenResponse {
  token: string;
  roomName: string;
  livekitUrl: string;
  groupName: string;
  /** Present only when the joined group is a LEAD group. Listen-only tokens for every sub-group. */
  subGroupRooms?: PTTSubGroupRoom[];
  /** Present only when the joined group is a SUB group. Listen-only token for the parent Lead group. */
  leadGroupRoom?: PTTSubGroupRoom;
}

export interface PTTParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  role: string;
}

export const pttService = {
  async getToken(groupId: string): Promise<PTTTokenResponse> {
    return apiClient.get<PTTTokenResponse>(ENDPOINTS.PTT.TOKEN(groupId));
  },

  async getParticipants(groupId: string): Promise<{ participants: PTTParticipant[] }> {
    return apiClient.get<{ participants: PTTParticipant[] }>(ENDPOINTS.PTT.PARTICIPANTS(groupId));
  },
};
