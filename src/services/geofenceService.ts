import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ENV } from '@/config/env';
import { secureStorage } from '@/utils/secureStorage';
import { ACCESS_TOKEN_KEY } from '@/config/constants';
import { Geofence } from '@/types';

export const GEOFENCE_TASK = 'GATHERSAFE_GEOFENCE';

// Register the background geofence task (must be called at module scope, outside components)
if (Platform.OS !== 'web') {
  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody) => {
    if (error) return;
    const { eventType, region } = data as {
      eventType: Location.GeofencingEventType;
      region: Location.LocationRegion;
    };

    if (eventType === Location.GeofencingEventType.Enter) {
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'You\'ve arrived at ' + (region.identifier || 'church'),
          body: 'Open GatherSafe to check in and enable location tracking for your team.',
          sound: true,
          data: { action: 'checkin' },
        },
        trigger: null,
      }).catch(() => null);
    }
  });
}

export const geofenceService = {
  async fetchGeofence(campusId: string): Promise<Geofence | null> {
    try {
      const token = await secureStorage.getItemAsync(ACCESS_TOKEN_KEY);
      const res = await fetch(`${ENV.apiUrl}/geofence?campusId=${encodeURIComponent(campusId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const { geofence } = await res.json();
      return geofence;
    } catch {
      return null;
    }
  },

  async saveGeofence(data: {
    campusId: string;
    name: string;
    latitude: number;
    longitude: number;
    radius: number;
  }): Promise<Geofence | null> {
    try {
      const token = await secureStorage.getItemAsync(ACCESS_TOKEN_KEY);
      const res = await fetch(`${ENV.apiUrl}/geofence`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) return null;
      const { geofence } = await res.json();
      return geofence;
    } catch {
      return null;
    }
  },

  async deleteGeofence(campusId: string): Promise<void> {
    try {
      const token = await secureStorage.getItemAsync(ACCESS_TOKEN_KEY);
      await fetch(`${ENV.apiUrl}/geofence?campusId=${encodeURIComponent(campusId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  },

  async startGeofencing(geofence: Geofence): Promise<void> {
    if (Platform.OS === 'web') return;

    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.requestPermissionsAsync();

    const regions: Location.LocationRegion[] = [
      {
        identifier: geofence.name,
        latitude: geofence.latitude,
        longitude: geofence.longitude,
        radius: geofence.radius,
        notifyOnEnter: true,
        notifyOnExit: false,
      },
    ];

    await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
  },

  async stopGeofencing(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    } catch {}
  },

  async isGeofencingActive(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    return Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
  },
};
