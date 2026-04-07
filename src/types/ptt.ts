export type PTTState = 'idle' | 'transmitting' | 'receiving';
export type ButtonMapping = 'volume_up' | 'volume_down' | 'bluetooth_hid' | 'screen_button';

export interface PTTConfig {
  primaryButton: ButtonMapping;
  defaultGroupId?: string; // Which group PTT defaults to
  beepOnTransmit: boolean;
  beepOnReceive: boolean;
  vibrateOnReceive: boolean;
  backgroundEnabled: boolean;
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
  audioUrl: string;
  durationMs: number;
  createdAt: string;
  sender: { id: string; displayName: string; avatarUrl: string | null };
}

export interface Geofence {
  id: string;
  organizationId: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // metres
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_PTT_CONFIG: PTTConfig = {
  primaryButton: 'screen_button',
  beepOnTransmit: true,
  beepOnReceive: true,
  vibrateOnReceive: true,
  backgroundEnabled: true,
};
