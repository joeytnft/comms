/**
 * CallKit Service (iOS) / ConnectionService (Android)
 *
 * Wraps react-native-callkeep to give PTT sessions a proper OS-level audio
 * call context. This is what keeps the process alive in the background and
 * routes audio through Bluetooth accessories on both platforms.
 *
 * Lifecycle mirrors the PTT channel session:
 *   joinChannel  → startCall()
 *   leaveChannel → endCall()
 *   startTransmitting → setMuted(false)
 *   stopTransmitting  → setMuted(true)
 *
 * Safe to call on web — every method is a no-op when the native module isn't present.
 */

import { Platform } from 'react-native';

// Lazy-require so web bundles never touch the native module
let RNCallKeep: typeof import('react-native-callkeep').default | null = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    RNCallKeep = require('react-native-callkeep').default;
  } catch {
    // Native module not linked yet (Expo Go) — PTT will still work in foreground
    RNCallKeep = null;
  }
}

// Simple UUID v4 generator (avoids an extra dependency)
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type EndCallCallback = () => void;
type AudioSessionCallback = () => void;

let endCallCallback: EndCallCallback | null = null;
let audioSessionCallback: AudioSessionCallback | null = null;
let isSetup = false;

export const callKitService = {
  /**
   * Call once at app startup (idempotent).  PTTProvider calls this on mount.
   */
  setup(): void {
    if (!RNCallKeep || isSetup) return;
    isSetup = true;

    RNCallKeep.setup({
      ios: {
        appName: 'GatherSafe',
        supportsVideo: false,
        maximumCallGroups: '1',
        maximumCallsPerCallGroup: '1',
        includesCallsInRecents: false,
      },
      android: {
        alertTitle: 'GatherSafe needs permission',
        alertDescription:
          'GatherSafe needs access to your phone accounts to keep PTT audio active in the background.',
        cancelButton: 'Cancel',
        okButton: 'OK',
        foregroundService: {
          channelId: 'com.gathersafeapp.ptt',
          channelName: 'PTT Active',
          notificationTitle: 'GatherSafe PTT Active',
          notificationIcon: 'ic_launcher_round',
        },
        additionalPermissions: [],
      },
    });

    RNCallKeep.setAvailable(true);

    // User dismissed the call from the lock screen / notification shade → leave channel
    RNCallKeep.addEventListener('endCall', () => {
      endCallCallback?.();
    });

    // iOS: CallKit activates the audio session asynchronously after startCall().
    // We signal PTTContext so it can proceed with LiveKit connection.
    RNCallKeep.addEventListener('didActivateAudioSession', () => {
      audioSessionCallback?.();
      audioSessionCallback = null; // one-shot per call
    });
  },

  /**
   * Register a callback to be invoked when the OS ends the call
   * (user swiped away from lock screen, or system terminated it).
   * PTTContext sets this to leaveChannel().
   */
  onEndCall(cb: EndCallCallback): void {
    endCallCallback = cb;
  },

  /**
   * Start a CallKit/ConnectionService call representing the PTT session.
   * Returns the UUID that must be passed to endCall / setMuted.
   *
   * On iOS the audio session is activated asynchronously; pass an onAudioReady
   * callback to be notified when LiveKit can safely connect.
   */
  startCall(groupName: string, onAudioReady?: AudioSessionCallback): string {
    const callUUID = generateUUID();
    if (!RNCallKeep) {
      // No native module — fire immediately so callers don't get stuck
      onAudioReady?.();
      return callUUID;
    }

    audioSessionCallback = onAudioReady ?? null;

    // On Android the audio session is synchronous, fire callback right after
    if (Platform.OS === 'android') {
      RNCallKeep.startCall(callUUID, groupName, groupName, 'generic', false);
      RNCallKeep.setMutedCall(callUUID, true); // start in listen-only mode
      onAudioReady?.();
      audioSessionCallback = null;
    } else {
      // iOS: CallKit may show a brief system UI; audio session fires via event
      RNCallKeep.startCall(callUUID, groupName, groupName, 'generic', false);
      RNCallKeep.setMutedCall(callUUID, true);
    }

    return callUUID;
  },

  endCall(callUUID: string): void {
    if (!RNCallKeep || !callUUID) return;
    RNCallKeep.endCall(callUUID);
  },

  /** Call when PTT button is pressed (unmute) or released (mute). */
  setMuted(callUUID: string, muted: boolean): void {
    if (!RNCallKeep || !callUUID) return;
    RNCallKeep.setMutedCall(callUUID, muted);
  },
};
