import { create } from 'zustand';
import { pcoClientService, PcoStatus, PcoPerson, PcoServicePlan, PcoServiceType } from '@/services/pcoClientService';

interface PcoState {
  status: PcoStatus | null;
  people: PcoPerson[];
  serviceTypes: PcoServiceType[];
  plans: PcoServicePlan[];
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;

  fetchStatus: () => Promise<void>;
  disconnect: () => Promise<void>;
  syncPeople: () => Promise<void>;
  syncServices: () => Promise<void>;
  clearError: () => void;
}

export const usePcoStore = create<PcoState>((set) => ({
  status: null,
  people: [],
  serviceTypes: [],
  plans: [],
  isLoading: false,
  isSyncing: false,
  error: null,

  fetchStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await pcoClientService.getStatus();
      set({ status, isLoading: false });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch status', isLoading: false });
    }
  },

  disconnect: async () => {
    set({ error: null });
    try {
      await pcoClientService.disconnect();
      set({ status: { connected: false, pcoOrgName: null, connectedAt: null, lastSyncAt: null, scopes: [] }, people: [], serviceTypes: [], plans: [] });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to disconnect' });
      throw e;
    }
  },

  syncPeople: async () => {
    set({ isSyncing: true, error: null });
    try {
      const { people } = await pcoClientService.syncPeople();
      set((s) => ({
        people,
        isSyncing: false,
        status: s.status ? { ...s.status, lastSyncAt: new Date().toISOString() } : s.status,
      }));
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Sync failed', isSyncing: false });
      throw e;
    }
  },

  syncServices: async () => {
    set({ isSyncing: true, error: null });
    try {
      const { serviceTypes, plans } = await pcoClientService.syncServices();
      set((s) => ({
        serviceTypes,
        plans,
        isSyncing: false,
        status: s.status ? { ...s.status, lastSyncAt: new Date().toISOString() } : s.status,
      }));
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Sync failed', isSyncing: false });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));
