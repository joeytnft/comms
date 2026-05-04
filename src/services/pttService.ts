import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';

export interface PTTSubGroupRoom {
  groupId: string;
  groupName: string;
  token: string;
  roomName: string;
}

export interface PTTLeadRoom {
  groupId: string;
  groupName: string;
  token: string;
  roomName: string;
  livekitUrl: string;
}

export interface PTTTokenResponse {
  token: string;
  roomName: string;
  livekitUrl: string;
  groupName: string;
  /** Present only when the joined group is a LEAD group. Listen-only tokens for every sub-group. */
  subGroupRooms?: PTTSubGroupRoom[];
  /** Present when the joined group has a parent LEAD group. Listen-only token for pre-connecting. */
  leadRoom?: PTTLeadRoom;
}

export interface PTTParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  role: string;
}

export interface PTTLeadRoomTokenResponse {
  token: string;
  roomName: string;
  livekitUrl: string;
  groupName: string;
}

export const pttService = {
  async getToken(groupId: string): Promise<PTTTokenResponse> {
    return apiClient.get<PTTTokenResponse>(ENDPOINTS.PTT.TOKEN(groupId));
  },

  async getParticipants(groupId: string): Promise<{ participants: PTTParticipant[] }> {
    return apiClient.get<{ participants: PTTParticipant[] }>(ENDPOINTS.PTT.PARTICIPANTS(groupId));
  },

  /** Sub-group members call this when a lead broadcast starts to get a listen-only token. */
  async getLeadRoomToken(leadGroupId: string): Promise<PTTLeadRoomTokenResponse> {
    return apiClient.get<PTTLeadRoomTokenResponse>(`/ptt/${leadGroupId}/lead-room-token`);
  },
};
