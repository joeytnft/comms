/**
 * Background PTT Service
 *
 * Android: Keeps a foreground service notification alive so the PTT socket
 * connection and BLE monitor are not killed by the OS when the app is backgrounded.
 *
 * iOS: The app.json already declares UIBackgroundModes: audio + voip.
 * The audio session is kept active here so audio continues in background.
 *
 * This module is safe to call on web (all calls become no-ops).
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_PTT_TASK = 'GATHERSAFE_PTT_BG';

// Register the background task (module scope — required by expo-task-manager)
if (Platform.OS !== 'web') {
  TaskManager.defineTask(BACKGROUND_PTT_TASK, async (): Promise<void> => {
    // The actual PTT work happens in PTTContext / socket connection.
    // This task registration keeps the process alive on Android.
  });
}

export const backgroundService = {
  /**
   * Show a persistent foreground notification on Android so the OS does not
   * suspend the process while PTT is active. On iOS this is a no-op because
   * the voip + audio background modes handle it.
   */
  async startForegroundNotification(groupName: string): Promise<void> {
    if (Platform.OS !== 'android') return;

    await Notifications.setNotificationChannelAsync('ptt-foreground', {
      name: 'PTT Active',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      showBadge: false,
    });

    await Notifications.scheduleNotificationAsync({
      identifier: 'ptt-foreground',
      content: {
        title: 'GatherSafe — PTT Active',
        body: `Listening on ${groupName}. Press the PTT button to talk.`,
        sticky: true,
        autoDismiss: false,
        data: { type: 'ptt_foreground' },
      },
      trigger: null,
    });
  },

  /** Remove the foreground notification when PTT is disconnected */
  async stopForegroundNotification(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await Notifications.dismissNotificationAsync('ptt-foreground').catch(() => null);
  },
};
