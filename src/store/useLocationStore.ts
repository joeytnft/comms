import { create } from 'zustand';
import * as Location from 'expo-location';
import { TeamMemberLocation } from '@/types';
import { locationService } from '@/services/locationService';

interface LocationState {
  teamLocations: TeamMemberLocation[];
  isSharing: boolean;
  isLoading: boolean;
  error: string | null;

  fetchTeamLocations: () => Promise<void>;
  updateMyLocation: (latitude: number, longitude: number) => Promise<void>;
  startSharing: () => Promise<void>;
  stopSharing: () => void;
  setSharing: (sharing: boolean) => void;
  clearError: () => void;
}

let watchSubscription: Location.LocationSubscription | null = null;

export const useLocationStore = create<LocationState>((set, get) => ({
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

  startSharing: async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      set({ error: 'Location permission denied' });
      return;
    }

    // Get initial position immediately
    const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await get().updateMyLocation(initial.coords.latitude, initial.coords.longitude);

    // Watch for updates every ~15 seconds (minimum distance 10m)
    watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 15_000,
        distanceInterval: 10,
      },
      (loc) => {
        get().updateMyLocation(loc.coords.latitude, loc.coords.longitude);
      },
    );

    set({ isSharing: true, error: null });
  },

  stopSharing: () => {
    if (watchSubscription) {
      watchSubscription.remove();
      watchSubscription = null;
    }
    set({ isSharing: false });
  },

  // Convenience toggle used by the UI
  setSharing: (sharing) => {
    if (sharing) {
      get().startSharing();
    } else {
      get().stopSharing();
    }
  },

  clearError: () => set({ error: null }),
}));
