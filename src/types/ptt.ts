export type PTTState = 'idle' | 'transmitting' | 'receiving';
export type ButtonMapping = 'volume_up' | 'volume_down' | 'bluetooth_hid' | 'screen_button';

export interface PTTConfig {
  primaryButton: ButtonMapping;
  defaultGroupId?: string; // Which group PTT defaults to
  beepOnTransmit: boolean;
  beepOnReceive: boolean;
  vibrateOnReceive: boolean;
  backgroundEnabled: boolean;
  showLiveActivity: boolean; // iOS: show Dynamic Island / Lock Screen pill while PTT is active
}

export interface PTTSession {
  groupId: string;
  groupName: string;
  state: PTTState;
  activeSpeaker?: {
    userId: string;
    displayName: string;
  };
  connectedMembers: number;
}

export interface PTTTransmission {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
}

export interface PttLog {
  id: string;
  groupId: string;
  senderId: string;
  audioUrl: string | null;
  durationMs: number;
  createdAt: string;
  sender: { id: string; displayName: string; avatarUrl: string | null };
}

export interface Geofence {
  id: string;
  organizationId: string;
  campusId: string;
  name: string;
  type: 'circle' | 'polygon';
  latitude: number;
  longitude: number;
  radius: number; // metres (bounding circle for polygons)
  polygon: number[][] | null; // GeoJSON ring [[lng, lat], ...] when type === 'polygon'
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_PTT_CONFIG: PTTConfig = {
  primaryButton: 'screen_button',
  beepOnTransmit: true,
  beepOnReceive: true,
  vibrateOnReceive: true,
  backgroundEnabled: true,
  showLiveActivity: true,
};
