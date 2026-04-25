import { create } from 'zustand';
import { PTTState, PTTConfig, DEFAULT_PTT_CONFIG } from '@/types';
import { pttService, PTTTokenResponse, PTTParticipant } from '@/services/pttService';

interface ActiveSpeaker {
  userId: string;
  displayName: string;
  startedAt: string;
}

interface PTTStoreState {
  // Connection state
  currentGroupId: string | null;
  currentGroupName: string | null;
  pttState: PTTState;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;

  // Token/room info
  token: string | null;
  roomName: string | null;
  livekitUrl: string | null;

  // Participants
  participants: PTTParticipant[];
  connectedMemberIds: string[];
  activeSpeaker: ActiveSpeaker | null;

  // Config
  config: PTTConfig;

  // Actions
  fetchToken: (groupId: string) => Promise<PTTTokenResponse>;
  fetchParticipants: (groupId: string) => Promise<void>;
  setConnected: (connected: boolean) => void;
  setTransmitting: (transmitting: boolean) => void;
  setActiveSpeaker: (speaker: ActiveSpeaker | null) => void;
  setConnectedMembers: (memberIds: string[]) => void;
  addConnectedMember: (userId: string) => void;
  removeConnectedMember: (userId: string) => void;
  updateConfig: (updates: Partial<PTTConfig>) => void;
  setCurrentGroup: (groupId: string, groupName: string) => void;
  disconnect: () => void;
  clearError: () => void;
}

export const usePTTStore = create<PTTStoreState>((set, get) => ({
  currentGroupId: null,
  currentGroupName: null,
  pttState: 'idle',
  isConnecting: false,
  isConnected: false,
  error: null,

  token: null,
  roomName: null,
  livekitUrl: null,

  participants: [],
  connectedMemberIds: [],
  activeSpeaker: null,

  config: DEFAULT_PTT_CONFIG,

  fetchToken: async (groupId) => {
    set({ isConnecting: true, error: null });
    try {
      const response = await pttService.getToken(groupId);
      set({
        token: response.token,
        roomName: response.roomName,
        livekitUrl: response.livekitUrl,
        currentGroupName: response.groupName,
        isConnecting: false,
      });
      return response;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to get PTT token';
      set({ error: message, isConnecting: false });
      throw error;
    }
  },

  fetchParticipants: async (groupId) => {
    try {
      const { participants } = await pttService.getParticipants(groupId);
      set({ participants });
    } catch {
      // Non-critical
    }
  },

  setConnected: (connected) => {
    set({ isConnected: connected, isConnecting: false });
  },

  setTransmitting: (transmitting) => {
    set({ pttState: transmitting ? 'transmitting' : 'idle' });
  },

  setActiveSpeaker: (speaker) => {
    set((state) => ({
      activeSpeaker: speaker,
      // Never override 'transmitting' — if we're mid-transmission and somehow
      // receive our own ptt:speaking echo, the button must stay red.
      pttState: state.pttState === 'transmitting'
        ? 'transmitting'
        : speaker
          ? 'receiving'
          : state.pttState === 'receiving' ? 'idle' : state.pttState,
    }));
  },

  setConnectedMembers: (memberIds) => {
    set({ connectedMemberIds: memberIds });
  },

  addConnectedMember: (userId) => {
    set((state) => ({
      connectedMemberIds: state.connectedMemberIds.includes(userId)
        ? state.connectedMemberIds
        : [...state.connectedMemberIds, userId],
    }));
  },

  removeConnectedMember: (userId) => {
    set((state) => ({
      connectedMemberIds: state.connectedMemberIds.filter((id) => id !== userId),
    }));
  },

  updateConfig: (updates) => {
    set((state) => ({ config: { ...state.config, ...updates } }));
  },

  setCurrentGroup: (groupId, groupName) => {
    set({ currentGroupId: groupId, currentGroupName: groupName });
  },

  disconnect: () => {
    set({
      currentGroupId: null,
      currentGroupName: null,
      pttState: 'idle',
      isConnected: false,
      isConnecting: false,
      token: null,
      roomName: null,
      livekitUrl: null,
      connectedMemberIds: [],
      activeSpeaker: null,
    });
  },

  clearError: () => set({ error: null }),
}));
