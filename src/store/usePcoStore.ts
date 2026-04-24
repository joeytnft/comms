import { create } from 'zustand';
import {
  pcoClientService,
  PcoStatus,
  PcoPerson,
  PcoTeam,
  PcoServicePlan,
  PcoScheduledPerson,
  PeopleSyncResult,
} from '@/services/pcoClientService';

interface PcoState {
  status: PcoStatus | null;
  people: PcoPerson[];
  teams: PcoTeam[];
  plans: PcoServicePlan[];
  planSchedule: Record<string, PcoScheduledPerson[]>; // keyed by pcoPlanId
  lastSyncResult: PeopleSyncResult | null;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;

  fetchStatus: () => Promise<void>;
  fetchPeople: () => Promise<void>;
  fetchTeams: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  fetchPlanSchedule: (pcoPlanId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  syncPeople: () => Promise<void>;
  syncTeams: () => Promise<void>;
  syncServices: () => Promise<void>;
  linkTeam: (pcoTeamId: string, groupId: string | null) => Promise<void>;
  clearError: () => void;
}

export const usePcoStore = create<PcoState>((set, _get) => ({
  status: null,
  people: [],
  teams: [],
  plans: [],
  planSchedule: {},
  lastSyncResult: null,
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

  fetchPeople: async () => {
    try {
      const people = await pcoClientService.getPeople();
      set({ people });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load PCO people' });
    }
  },

  fetchTeams: async () => {
    try {
      const teams = await pcoClientService.getTeams();
      set({ teams });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load PCO teams' });
    }
  },

  fetchPlans: async () => {
    try {
      const plans = await pcoClientService.getPlans();
      set({ plans });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load PCO plans' });
    }
  },

  fetchPlanSchedule: async (pcoPlanId: string) => {
    try {
      const { scheduled } = await pcoClientService.getPlanSchedule(pcoPlanId);
      set((s) => ({ planSchedule: { ...s.planSchedule, [pcoPlanId]: scheduled } }));
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load schedule' });
    }
  },

  disconnect: async () => {
    set({ error: null });
    try {
      await pcoClientService.disconnect();
      set({
        status: { connected: false, pcoOrgName: null, connectedAt: null, lastSyncAt: null, scopes: [] },
        people: [],
        teams: [],
        plans: [],
        planSchedule: {},
        lastSyncResult: null,
      });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to disconnect' });
      throw e;
    }
  },

  syncPeople: async () => {
    set({ isSyncing: true, error: null });
    try {
      const result = await pcoClientService.syncPeople();
      set((s) => ({
        people: result.people,
        lastSyncResult: result,
        isSyncing: false,
        status: s.status ? { ...s.status, lastSyncAt: new Date().toISOString() } : s.status,
      }));
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Sync failed', isSyncing: false });
      throw e;
    }
  },

  syncTeams: async () => {
    set({ isSyncing: true, error: null });
    try {
      await pcoClientService.syncTeams();
      const teams = await pcoClientService.getTeams();
      set((s) => ({
        teams,
        isSyncing: false,
        status: s.status ? { ...s.status, lastSyncAt: new Date().toISOString() } : s.status,
      }));
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Team sync failed', isSyncing: false });
      throw e;
    }
  },

  syncServices: async () => {
    set({ isSyncing: true, error: null });
    try {
      await pcoClientService.syncServices();
      const plans = await pcoClientService.getPlans();
      set((s) => ({
        plans,
        isSyncing: false,
        status: s.status ? { ...s.status, lastSyncAt: new Date().toISOString() } : s.status,
      }));
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Sync failed', isSyncing: false });
      throw e;
    }
  },

  linkTeam: async (pcoTeamId: string, groupId: string | null) => {
    await pcoClientService.linkTeam(pcoTeamId, groupId);
    // Refresh teams to reflect new link
    const teams = await pcoClientService.getTeams();
    set({ teams });
  },

  clearError: () => set({ error: null }),
}));
