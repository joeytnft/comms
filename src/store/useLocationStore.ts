import { create } from 'zustand';
import { TeamMemberLocation } from '@/types';
import { locationService } from '@/services/locationService';

interface LocationState {
  teamLocations: TeamMemberLocation[];
  isSharing: boolean;
  isLoading: boolean;
  error: string | null;

  fetchTeamLocations: () => Promise<void>;
  updateMyLocation: (latitude: number, longitude: number) => Promise<void>;
  setSharing: (sharing: boolean) => void;
  clearError: () => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  teamLocations: [],
  isSharing: false,
  isLoading: false,
  error: null,

  fetchTeamLocations: async () => {
    set({ isLoading: true, error: null });
    try {
      const { locations } = await locationService.getTeamLocations();
      set({ teamLocations: locations, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load team locations';
      set({ error: message, isLoading: false });
    }
  },

  updateMyLocation: async (latitude, longitude) => {
    try {
      await locationService.updateLocation(latitude, longitude);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update location';
      set({ error: message });
    }
  },

  setSharing: (sharing) => set({ isSharing: sharing }),
  clearError: () => set({ error: null }),
}));
