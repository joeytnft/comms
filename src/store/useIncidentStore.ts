import { create } from 'zustand';
import { Incident, CreateIncidentData, UpdateIncidentData } from '@/types';
import { incidentService } from '@/services/incidentService';

interface IncidentState {
  incidents: Incident[];
  currentIncident: Incident | null;
  isLoading: boolean;
  error: string | null;
  nextCursor: string | null;

  fetchIncidents: (opts?: { status?: string; refresh?: boolean }) => Promise<void>;
  loadMore: () => Promise<void>;
  fetchIncident: (id: string) => Promise<void>;
  createIncident: (data: CreateIncidentData) => Promise<Incident>;
  updateIncident: (id: string, data: UpdateIncidentData) => Promise<void>;
  addPhoto: (incidentId: string, encryptedUrl: string) => Promise<void>;
  clearError: () => void;
  clearCurrentIncident: () => void;
}

export const useIncidentStore = create<IncidentState>((set, get) => ({
  incidents: [],
  currentIncident: null,
  isLoading: false,
  error: null,
  nextCursor: null,

  fetchIncidents: async (opts) => {
    set({ isLoading: true, error: null });
    try {
      const { incidents, nextCursor } = await incidentService.listIncidents({
        status: opts?.status,
        limit: 20,
      });
      set({ incidents, nextCursor, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load incidents';
      set({ error: message, isLoading: false });
    }
  },

  loadMore: async () => {
    const { nextCursor } = get();
    if (!nextCursor) return;

    try {
      const { incidents: more, nextCursor: newCursor } = await incidentService.listIncidents({
        cursor: nextCursor,
        limit: 20,
      });
      set((state) => ({
        incidents: [...state.incidents, ...more],
        nextCursor: newCursor,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load more incidents';
      set({ error: message });
    }
  },

  fetchIncident: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { incident } = await incidentService.getIncident(id);
      set({ currentIncident: incident, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load incident';
      set({ error: message, isLoading: false });
    }
  },

  createIncident: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const { incident } = await incidentService.createIncident(data);
      set((state) => ({
        incidents: [incident, ...state.incidents],
        isLoading: false,
      }));
      return incident;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create incident';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  updateIncident: async (id, data) => {
    set({ error: null });
    try {
      const { incident } = await incidentService.updateIncident(id, data);
      set((state) => ({
        incidents: state.incidents.map((i) => (i.id === id ? incident : i)),
        currentIncident: state.currentIncident?.id === id ? incident : state.currentIncident,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update incident';
      set({ error: message });
      throw error;
    }
  },

  addPhoto: async (incidentId, encryptedUrl) => {
    set({ error: null });
    try {
      const { photo } = await incidentService.addPhoto(incidentId, encryptedUrl);
      set((state) => {
        if (state.currentIncident?.id === incidentId) {
          return {
            currentIncident: {
              ...state.currentIncident,
              photos: [...state.currentIncident.photos, photo],
            },
          };
        }
        return {};
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to add photo';
      set({ error: message });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
  clearCurrentIncident: () => set({ currentIncident: null }),
}));
