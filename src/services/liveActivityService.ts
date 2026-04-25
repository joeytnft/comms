/**
 * liveActivityService — JS wrapper for the iOS Live Activity native module.
 *
 * Controls the GatherSafe Dynamic Island / Lock Screen pill shown while a PTT
 * session is active. Safe to call on Android / web — every method is a no-op.
 *
 * Lifecycle:
 *   PTTContext.joinChannel   → start()
 *   PTT state changes        → update()
 *   PTTContext.leaveChannel  → end()
 */

import { Platform, NativeModules } from 'react-native';

const { LiveActivityModule } = NativeModules;

// Available on iOS 16.2+ dev builds; never in Expo Go or on Android/web.
const isAvailable =
  Platform.OS === 'ios' && typeof LiveActivityModule?.startActivity === 'function';

export interface LiveActivityState {
  channelName: string;
  speakerName: string | null;
  lastSpeakerName: string | null;
  isTransmitting: boolean;
  memberCount: number;
  alertLevel: string | null;
}

export const liveActivityService = {
  isAvailable,

  /**
   * Start a new Live Activity for a PTT session.
   * Returns an opaque activity ID to pass to update() and end().
   */
  async start(channelName: string, orgName: string): Promise<string | null> {
    if (!isAvailable) return null;
    try {
      return await LiveActivityModule.startActivity(channelName, orgName);
    } catch (err) {
      console.warn('[LiveActivity] start failed:', err);
      return null;
    }
  },

  /**
   * Update the Dynamic Island pill with the latest PTT state.
   * No-op if activityId is null (activity didn't start, e.g. older iOS).
   */
  async update(activityId: string | null, state: LiveActivityState): Promise<void> {
    if (!isAvailable || !activityId) return;
    try {
      await LiveActivityModule.updateActivity(
        activityId,
        state.channelName,
        state.speakerName ?? null,
        state.lastSpeakerName ?? null,
        state.isTransmitting,
        state.memberCount,
        state.alertLevel ?? null,
      );
    } catch (err) {
      console.warn('[LiveActivity] update failed:', err);
    }
  },

  /** End and dismiss the Live Activity immediately. Ends ALL activities if ID is unknown. */
  async end(activityId: string | null): Promise<void> {
    if (!isAvailable) return;
    try {
      // Pass empty string when ID is unknown — native side ends ALL activities.
      await LiveActivityModule.endActivity(activityId ?? '');
    } catch (err) {
      console.warn('[LiveActivity] end failed:', err);
    }
  },
};
