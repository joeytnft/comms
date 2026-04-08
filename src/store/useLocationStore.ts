import { create } from 'zustand';
import * as Location from 'expo-location';
import { TeamMemberLocation } from '@/types';
import { locationService } from '@/services/locationService';
import { secureStorage } from '@/utils/secureStorage';
import {
  LOCATION_UPDATE_INTERVAL,
  LOCATION_DISTANCE_FILTER,
  LOCATION_SHARING_KEY,
} from '@/config/constants';

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
  /** Called once on app start — resumes sharing if it was on before */
  initSharing: () => Promise<void>;
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
    // Already watching — nothing to do
    if (watchSubscription) {
      set({ isSharing: true });
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      set({ error: 'Location permission denied' });
      return;
    }

    // Get initial position immediately
    const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await get().updateMyLocation(initial.coords.latitude, initial.coords.longitude);

    // Watch for updates every 5 seconds / 5 metres
    watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: LOCATION_UPDATE_INTERVAL,
        distanceInterval: LOCATION_DISTANCE_FILTER,
      },
      (loc) => {
        get().updateMyLocation(loc.coords.latitude, loc.coords.longitude);
      },
    );

    set({ isSharing: true, error: null });
    await secureStorage.setItemAsync(LOCATION_SHARING_KEY, 'true');
  },

  stopSharing: () => {
    if (watchSubscription) {
      watchSubscription.remove();
      watchSubscription = null;
    }
    set({ isSharing: false });
    secureStorage.setItemAsync(LOCATION_SHARING_KEY, 'false').catch(() => null);
  },

  // Convenience toggle used by the UI
  setSharing: (sharing) => {
    if (sharing) {
      get().startSharing();
    } else {
      get().stopSharing();
    }
  },

  // Restore sharing state after app restart
  initSharing: async () => {
    try {
      const persisted = await secureStorage.getItemAsync(LOCATION_SHARING_KEY);
      if (persisted === 'true') {
        await get().startSharing();
      }
    } catch {
      // Ignore — non-critical
    }
  },

  clearError: () => set({ error: null }),
}));
