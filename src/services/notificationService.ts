import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { apiClient } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown>;
    const isCritical = data?.alertType === 'ACTIVE_SHOOTER';
    const isAlert = data?.type === 'alert';
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: isAlert || isCritical,
      shouldSetBadge: false,
      // Critical alerts override the app's own sound settings
      ...(isCritical ? { shouldPlaySound: true } : {}),
    };
  },
});

export const notificationService = {
  /**
   * Request notification permissions and register the Expo push token with the server.
   * Safe to call multiple times — silently no-ops on web or simulators.
   */
  async registerPushToken(): Promise<void> {
    if (Platform.OS === 'web') return;

    // Simulators don't support push notifications
    if (!Device.isDevice) return;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    // Create notification channels on Android
    if (Platform.OS === 'android') {
      // Critical safety alerts — bypasses Do Not Disturb
      await Notifications.setNotificationChannelAsync('critical-alerts', {
        name: 'Critical Safety Alerts',
        description: 'Active shooter and other life-safety emergencies. Always audible.',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        enableVibrate: true,
        vibrationPattern: [0, 500, 200, 500, 200, 500],
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.ALARM,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
          flags: {
            enforceAudibility: true,
            requestHardwareAudioVideoSynchronization: false,
          },
        },
      });

      await Notifications.setNotificationChannelAsync('alerts', {
        name: 'Alerts',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        enableVibrate: true,
        vibrationPattern: [0, 250, 250, 250],
      });

      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }

    // Request iOS Critical Alert permission (requires Apple entitlement approval)
    if (Platform.OS === 'ios') {
      await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowCriticalAlerts: true,
        },
      });
    }

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const expoPushToken = tokenData.data;

      await apiClient.put(ENDPOINTS.USERS.UPDATE_PUSH_TOKEN, { expoPushToken });
    } catch {
      // Token registration is best-effort; don't crash the app
    }
  },

  /**
   * Unregister push token on logout.
   */
  async unregisterPushToken(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      await apiClient.put(ENDPOINTS.USERS.UPDATE_PUSH_TOKEN, { expoPushToken: null });
    } catch {
      // Best-effort
    }
  },
};
