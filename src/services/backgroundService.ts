/**
 * Background PTT Service
 *
 * Android foreground service and iOS audio-session keep-alive are both now
 * handled by react-native-callkeep (ConnectionService on Android, CallKit on iOS).
 * See callKitService.ts.
 *
 * This module is kept as a lightweight shim so existing imports don't break.
 * All methods are no-ops — the real work happens via callKitService.
 */

export const BACKGROUND_PTT_TASK = 'GATHERSAFE_PTT_BG';

export const backgroundService = {
  async startForegroundNotification(_groupName: string): Promise<void> {
    // Handled by callKitService.startCall() via ConnectionService / CallKit
  },
  async stopForegroundNotification(): Promise<void> {
    // Handled by callKitService.endCall()
  },
};
