import { create } from 'zustand';
import { PttLog } from '@/types';
import { ENV } from '@/config/env';
import { secureStorage } from '@/utils/secureStorage';
import { ACCESS_TOKEN_KEY } from '@/config/constants';

interface PTTLogState {
  logs: Record<string, PttLog[]>; // keyed by groupId
  isLoading: boolean;
  error: string | null;

  fetchLogs: (groupId: string) => Promise<void>;
  prependLog: (log: PttLog) => void;
  updateLogAudioUrl: (id: string, groupId: string, audioUrl: string) => void;
  clearError: () => void;
}

export const usePTTLogStore = create<PTTLogState>((set) => ({
  logs: {},
  isLoading: false,
  error: null,

  fetchLogs: async (groupId: string) => {
    set({ isLoading: true, error: null });
    try {
      const token = await secureStorage.getItemAsync(ACCESS_TOKEN_KEY);
      const res = await fetch(`${ENV.apiUrl}/ptt-logs/${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load voice log');
      const { logs } = await res.json();
      set((state) => ({
        logs: { ...state.logs, [groupId]: logs },
        isLoading: false,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load voice log';
      set({ error: message, isLoading: false });
    }
  },

  prependLog: (log: PttLog) => {
    set((state) => ({
      logs: {
        ...state.logs,
        [log.groupId]: [log, ...(state.logs[log.groupId] ?? [])],
      },
    }));
  },

  updateLogAudioUrl: (id: string, groupId: string, audioUrl: string) => {
    set((state) => ({
      logs: {
        ...state.logs,
        [groupId]: (state.logs[groupId] ?? []).map((log) =>
          log.id === id ? { ...log, audioUrl } : log,
        ),
      },
    }));
  },

  clearError: () => set({ error: null }),
}));
