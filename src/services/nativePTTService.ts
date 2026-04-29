/**
 * nativePTTService — TypeScript wrapper for the iOS Apple PTT native module.
 *
 * Available on iOS 16+ only. On older iOS / Android / Web, every method is a
 * silent no-op so the rest of the codebase does not need platform guards.
 *
 * PTTContext.tsx uses this service on iOS and falls back to callKitService on Android.
 */

import { Platform, NativeModules, NativeEventEmitter } from 'react-native';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PTTTransmitSource = 'user' | 'systemUI' | 'bluetooth';
export type PTTServiceStatus  = 'ready' | 'connecting' | 'disrupted';

export interface PTTTransmissionEvent {
  channelId: string;
  source: PTTTransmitSource;
  error?: string;
}

// ─── Native module reference ─────────────────────────────────────────────────

const { PushToTalkModule } = NativeModules;

const isAvailable = Platform.OS === 'ios' && typeof PushToTalkModule?.initialize === 'function';

let emitter: NativeEventEmitter | null = null;
if (isAvailable) {
  emitter = new NativeEventEmitter(PushToTalkModule);
}

// ─── Event subscription helpers ──────────────────────────────────────────────

type Unsubscribe = () => void;

function on(event: string, handler: (data: Record<string, unknown>) => void): Unsubscribe {
  if (!emitter) return () => undefined;
  const sub = emitter.addListener(event, handler);
  return () => sub.remove();
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create the iOS PTChannelManager singleton at app launch — BEFORE any user
 * action joins a channel. Required for iOS to restore a previously-joined
 * PTT channel after the app is killed/relaunched. Per Apple's docs:
 *
 *   "Initialize the channel manager as soon as possible during startup to
 *    ensure the framework can restore existing channels and deliver push
 *    notifications to the app."
 *
 * No-op on Android, web, or older iOS. Safe to call multiple times — the
 * native implementation is idempotent.
 */
async function preinit(): Promise<void> {
  if (!isAvailable) return;
  if (typeof PushToTalkModule.preinit !== 'function') return;
  return PushToTalkModule.preinit();
}

/**
 * Join a PTT channel. `channelUUID` is a fresh RFC 4122 UUID generated per
 * join — passing one ensures every join uses a distinct UUID even when the
 * underlying group ID is the same, which avoids iOS queuing a stale
 * didLeaveChannelWithUUID for the previous session that shares the new
 * session's UUID. Returns the resolved channel UUID (typically the one
 * passed in, normalised by iOS).
 */
async function joinChannel(
  channelId: string,
  channelName: string,
  channelUUID?: string,
): Promise<string> {
  if (!isAvailable) return channelUUID ?? channelId;
  return PushToTalkModule.initialize(channelId, channelName, channelUUID ?? null);
}

async function leaveChannel(channelId: string): Promise<void> {
  if (!isAvailable) return;
  return PushToTalkModule.leaveChannel(channelId);
}

/**
 * Restore the framework's joined state after iOS delivers a stale
 * didLeaveChannelWithUUID (queued during initialize for the previous session).
 * Calls requestJoinChannelWithUUID with the preserved UUID so subsequent
 * requestBeginTransmittingWithChannelUUID succeeds instead of firing
 * failedToBeginTransmittingInChannelWithUUID.
 */
async function rejoinChannel(channelId: string): Promise<void> {
  if (!isAvailable) return;
  if (typeof PushToTalkModule.rejoinChannel !== 'function') return;
  return PushToTalkModule.rejoinChannel(channelId);
}

/** Call when the user presses the PTT button. */
async function beginTransmitting(channelId: string): Promise<void> {
  if (!isAvailable) return;
  return PushToTalkModule.startTransmitting(channelId);
}

/** Call when the user releases the PTT button. */
async function stopTransmitting(channelId: string): Promise<void> {
  if (!isAvailable) return;
  return PushToTalkModule.stopTransmitting(channelId);
}

/**
 * Tell the system who is speaking (received via APNs pushtotalk push).
 * This updates the Dynamic Island and lock screen UI.
 */
async function setActiveRemoteParticipant(channelId: string, participantName: string): Promise<void> {
  if (!isAvailable) return;
  return PushToTalkModule.setActiveRemoteParticipant(channelId, participantName);
}

/** Clear the active speaker indicator when they stop talking. */
async function clearActiveRemoteParticipant(channelId: string): Promise<void> {
  if (!isAvailable) return;
  // Pass null participantName to the native setActiveRemoteParticipant — this clears the speaker.
  return PushToTalkModule.setActiveRemoteParticipant(channelId, null);
}

/**
 * Update the channel name shown in system UI (e.g. when the user switches groups).
 */
async function setChannelDescriptor(channelId: string, channelName: string): Promise<void> {
  if (!isAvailable) return;
  return PushToTalkModule.setChannelDescriptor(channelId, channelName);
}

/**
 * Report backend connectivity to the system UI.
 * Call 'connecting' when network drops; 'ready' when restored.
 */
async function setServiceStatus(channelId: string, status: PTTServiceStatus): Promise<void> {
  if (!isAvailable) return;
  return PushToTalkModule.setServiceStatus(channelId, status);
}

// ─── Event subscriptions ─────────────────────────────────────────────────────

/** Fired once after joinChannel succeeds. */
function onChannelJoined(cb: (channelId: string) => void): Unsubscribe {
  return on('onPTTChannelJoined', (d) => cb(d.channelId as string));
}

function onChannelLeft(cb: (channelId: string) => void): Unsubscribe {
  return on('onPTTChannelLeft', (d) => cb(d.channelId as string));
}

function onJoinFailed(cb: (channelId: string, error: string) => void): Unsubscribe {
  return on('onPTTError', (d) => cb(d.channelId as string, d.error as string));
}

/**
 * Fired with the ephemeral APNs device token after the channel is joined.
 * Send this token to your server so it can send pushtotalk pushes to this device.
 */
function onPushTokenReceived(cb: (token: string) => void): Unsubscribe {
  return on('onPTTPushToken', (d) => cb(d.token as string));
}

/**
 * Fired when audio transmission begins — regardless of source.
 * Source is 'user' (app button), 'systemUI' (lock screen / Dynamic Island),
 * or 'bluetooth' (accessory).
 * Note: native payload includes channelId but not source; source defaults to 'user'.
 */
function onTransmissionStarted(cb: (event: PTTTransmissionEvent) => void): Unsubscribe {
  return on('onPTTTransmitStart', (d) => cb({
    channelId: d.channelId as string,
    source: (d.source as PTTTransmitSource) ?? 'user',
  }));
}

function onTransmissionEnded(cb: (event: PTTTransmissionEvent) => void): Unsubscribe {
  return on('onPTTTransmitStop', (d) => cb({
    channelId: d.channelId as string,
    source: (d.source as PTTTransmitSource) ?? 'user',
  }));
}

function onTransmissionFailed(cb: (channelId: string, error: string) => void): Unsubscribe {
  return on('onPTTError', (d) => cb(d.channelId as string, d.error as string));
}

/**
 * Fired when iOS activates the audio session — safe to start recording or playback.
 * On transmit: start LiveKit mic.
 * On receive: start LiveKit audio playback.
 */
function onAudioActivated(cb: () => void): Unsubscribe {
  return on('onPTTAudioActivated', () => cb());
}

function onAudioDeactivated(cb: () => void): Unsubscribe {
  return on('onPTTAudioDeactivated', () => cb());
}

// ─── Exported service ─────────────────────────────────────────────────────────

export const nativePTTService = {
  isAvailable,

  // Lifecycle
  preinit,

  // Channel lifecycle
  joinChannel,
  leaveChannel,
  rejoinChannel,

  // Transmission control
  beginTransmitting,
  stopTransmitting,

  // Remote participant (incoming push)
  setActiveRemoteParticipant,
  clearActiveRemoteParticipant,

  // System UI
  setChannelDescriptor,
  setServiceStatus,

  // Event subscriptions
  onChannelJoined,
  onChannelLeft,
  onJoinFailed,
  onPushTokenReceived,
  onTransmissionStarted,
  onTransmissionEnded,
  onTransmissionFailed,
  onAudioActivated,
  onAudioDeactivated,
};
