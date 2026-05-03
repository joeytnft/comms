import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';
import { AudioModule } from '@/utils/audioStub';
import { PTTState, PTTConfig } from '@/types';
import { ENV } from '@/config/env';
import { useSocket } from './SocketContext';
import { usePTTStore } from '@/store/usePTTStore';
import { usePTTLogStore } from '@/store/usePTTLogStore';
import { useHardwareButton } from '@/hooks/useHardwareButton';
import { nativePTTService } from '@/services/nativePTTService';
import { pttRecorderService } from '@/services/pttRecorderService';
import { callKitService } from '@/services/callKitService';
import { bluetoothPTTService } from '@/services/bluetoothPTTService';
import { liveActivityService } from '@/services/liveActivityService';
import { useAuthStore } from '@/store/useAuthStore';
import { mmkvStorage } from '@/utils/mmkv';
import { apiClient } from '@/api/client';
import { pttService } from '@/services/pttService';
import { generateUUIDv4 } from '@/utils/uuid';
import { clientLog, forceFlush, setClientContext, SESSION_ID } from '@/services/clientLogger';

// HTTP helper for ptt:start / ptt:stop / ptt:native_log / register-token.
// Routed through apiClient (NOT bespoke fetch) so the response interceptor
// catches expired access tokens, runs the refresh flow, and retries the
// request — without it, the access token silently expires after 15 minutes
// and every subsequent transmission is rejected with 401, which the user
// sees as "first transmission works, every press after that is ignored
// by the server but Apple's PTT framework still plays its tones."
async function pttPost(groupId: string, endpoint: string, body?: Record<string, unknown>): Promise<void> {
  try {
    await apiClient.post(`/ptt/${groupId}/${endpoint}`, body ?? {});
  } catch (err: unknown) {
    // 401 is already handled (refresh + retry) by the apiClient interceptor
    // before we see this rejection — anything reaching here is a real failure.
    console.warn(`[PTT] HTTP ${endpoint} failed`, err instanceof Error ? err.message : err);
  }
}

const LIVE_ACTIVITY_ID_KEY = 'ptt_live_activity_id';
// Persisted so we can clean up after a cold launch from the Dynamic Island —
// without these we have no way to tell the server the user left, so the room
// is stuck showing them as present until iOS force-ends the PTT session.
const PTT_GROUP_ID_KEY = 'ptt_stale_group_id';
const PTT_CHANNEL_ID_KEY = 'ptt_stale_native_channel_id';

// LiveKit (native only — tree-shaken on web)
let Room: typeof import('livekit-client').Room | null = null;
let RoomEvent: typeof import('livekit-client').RoomEvent | null = null;
let createLocalAudioTrack: typeof import('livekit-client').createLocalAudioTrack | null = null;
let AudioSession: typeof import('@livekit/react-native').AudioSession | null = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const lk = require('livekit-client');
  Room = lk.Room;
  RoomEvent = lk.RoomEvent;
  createLocalAudioTrack = lk.createLocalAudioTrack;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rnLk = require('@livekit/react-native');
  AudioSession = rnLk.AudioSession;
}

// Which PTT backend to use on this device
const USE_NATIVE_PTT = Platform.OS === 'ios' && nativePTTService.isAvailable;

interface PTTContextType {
  config: PTTConfig;
  pttState: PTTState;
  isConnected: boolean;
  isConnecting: boolean;
  currentGroupId: string | null;
  currentGroupName: string | null;
  activeSpeaker: { userId: string; displayName: string } | null;
  connectedMemberCount: number;
  connectedParticipants: import('@/services/pttService').PTTParticipant[];
  /** True when lead group admin has "Broadcast to All" mode active. */
  broadcastToAll: boolean;
  startTransmitting: () => void;
  stopTransmitting: () => void;
  joinChannel: (groupId: string) => Promise<void>;
  leaveChannel: () => void;
  updateConfig: (config: Partial<PTTConfig>) => void;
  /** Lead group admin only: toggle whether transmissions broadcast to all sub-groups. */
  toggleBroadcastMode: () => void;
}

const PTTContext = createContext<PTTContextType | undefined>(undefined);

export function PTTProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket();
  const store = usePTTStore();

  // LiveKit room instance (native)
  const roomRef = useRef<InstanceType<typeof import('livekit-client').Room> | null>(null);
  // Listen-only sub-group rooms for lead group members
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subRoomsRef = useRef<any[]>([]);
  // Pre-published mic track kept muted between transmissions for instant PTT response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const micTrackRef = useRef<any>(null);

  // Web MediaRecorder ref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // CallKit call UUID for the current PTT session (Android only)
  const callUUIDRef = useRef<string | null>(null);
  // Active PTT channel UUID (iOS native PTT)
  const nativePTTChannelIdRef = useRef<string | null>(null);
  // UUID of a channel join that is currently in flight (between the moment we
  // generate the UUID and the moment joinChannel resolves). If the user taps
  // Leave during this gap, nativePTTChannelIdRef is null but we still need
  // a UUID to pass to requestLeaveChannelWithUUID so the Dynamic Island closes.
  const joiningChannelIdRef = useRef<string | null>(null);
  // Set to true when the user deliberately calls leaveChannel
  const intentionalLeaveRef = useRef(false);
  // True only when native PTT framework successfully joined a channel this session
  const nativePTTActiveRef = useRef(false);
  // Timestamp after which the iOS PTT framework is considered ready for a new press.
  // The framework has a brief unavailable window after a stop; pressing into it causes
  // immediate onTransmissionFailed, which manifests as a red→green jitter to the user.
  const transmitCooldownUntilRef = useRef(0);
  // Live Activity ID for the current PTT session (iOS 16.2+ — currently
  // disabled at build time via app.json; the ref is retained as a no-op
  // anchor in case Live Activities are re-enabled later).
  const liveActivityIdRef = useRef<string | null>(null);
  // Persists the last speaker name so the lock-screen card can show "Last: X"
  // (also Live-Activity-only; see above).
  const lastSpeakerNameRef = useRef<string | null>(null);

  // Press-lifecycle state. Replaces four previously-loose refs
  // (transmittingRef, pttStartEmittedRef, nativePTTButtonRef,
  // transmitStartedAtRef) that had to be reset together at every transition
  // and got out of sync repeatedly. Single-write transitions via
  // beginTransmit / markStartEmitted / endTransmit eliminate the impossible
  // combinations (e.g. isTransmitting=true with startEmitted=true and
  // startedAt=0) that the four-ref version allowed.
  interface TransmitState {
    isTransmitting: boolean;
    startedAt: number;
    startEmitted: boolean;
    /**
     * True when the current transmission was initiated by the native PTT
     * framework (Dynamic Island, lock-screen, Bluetooth accessory) rather
     * than the in-app PTT button. Controls whether stopTransmitting() asks
     * the framework to deactivate (it does in both cases for the current
     * implementation, but the flag is preserved for future divergence).
     */
    ownedByNativeButton: boolean;
  }
  const IDLE_TRANSMIT: TransmitState = {
    isTransmitting: false,
    startedAt: 0,
    startEmitted: false,
    ownedByNativeButton: false,
  };
  const transmitStateRef = useRef<TransmitState>({ ...IDLE_TRANSMIT });
  const beginTransmit = useCallback((ownedByNativeButton: boolean) => {
    transmitStateRef.current = {
      isTransmitting: true,
      startedAt: Date.now(),
      startEmitted: false,
      ownedByNativeButton,
    };
  }, []);
  const markStartEmitted = useCallback(() => {
    transmitStateRef.current = { ...transmitStateRef.current, startEmitted: true };
  }, []);
  const endTransmit = useCallback(() => {
    transmitStateRef.current = { ...IDLE_TRANSMIT };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Safety net: auto-stop a transmission that was never explicitly stopped (e.g.
  // bug, crash, or stuck state from a reconnect mid-transmission).
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set by stopTransmitting() (and the reconnect handler) so that a
  // late-arriving onTransmissionEnded delegate — queued by iOS before the stop
  // call landed — doesn't wipe a rapid re-press's beginTransmit() state.
  const stopTransmittingCalledRef = useRef(false);
  // Absolute timestamp until which system-initiated onPTTChannelLeft events for
  // the active channel UUID are suppressed. Set to Date.now()+3000 at join.
  // iOS fires multiple didLeaveChannelWithUUID events during rapid channel
  // switching and during the native self-heal cascade; the 3-second window
  // absorbs all of them without a one-shot boolean that could be prematurely
  // consumed by the first event, leaving the second to freeze the PTT button.
  // Events with reason="user" or "systemUI" bypass the window unconditionally.
  const joinGraceWindowUntilRef = useRef(0);
  // Guard against two concurrent joinChannel() calls (rapid group switch).
  const joinInProgressRef = useRef(false);
  // Incremented by leaveChannel() so a slow in-flight joinChannel() detects
  // it was cancelled and skips the final setConnected(true).
  const joinCancelRef = useRef(0);
  // Wall-clock time of the most recent successful join. Used to decide whether
  // an unintentional Disconnected event likely reflects an expired LiveKit
  // token (issued for ~6h) vs. a transient network failure that LiveKit's
  // built-in auto-reconnect should have already handled.
  const joinedAtRef = useRef<number>(0);
  // Refs that point at the latest joinChannel/leaveChannel callbacks. The
  // LiveKit Disconnected handler is registered inside joinChannel itself, so
  // it can't reference those callbacks lexically without a TDZ headache.
  // The effect below keeps these in sync on every render.
  const joinChannelRef  = useRef<((groupId: string) => Promise<void>) | null>(null);
  const leaveChannelRef = useRef<(() => void) | null>(null);
  // Set true while an auto-rejoin is in flight so a second Disconnected
  // doesn't kick off a parallel rejoin attempt.
  const rejoinInFlightRef = useRef(false);

  // ── Broadcast-to-All state (lead group admin only) ──────────────────────────
  // `broadcastToAll` is exposed to the UI so the toggle button re-renders.
  // `broadcastToAllRef` keeps the current value in sync for callbacks that
  // capture broadcastToAll in a closure (startTransmitting, stopTransmitting).
  const [broadcastToAll, setBroadcastToAll] = useState(false);
  const broadcastToAllRef = useRef(false);
  const toggleBroadcastMode = useCallback(() => {
    const next = !broadcastToAllRef.current;
    broadcastToAllRef.current = next;
    setBroadcastToAll(next);
  }, []);

  // Temporary listen-only room joined by sub-group members during a lead broadcast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leadBroadcastRoomRef = useRef<any>(null);
  // Timer to disconnect from the lead broadcast room after a short idle window.
  const leadBroadcastDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always-current socket ref so native PTT callbacks (registered once) can emit
  // even when the socket reconnects and the `socket` variable changes identity.
  const socketRef = useRef(socket);
  useEffect(() => { socketRef.current = socket; }, [socket]);

  // When the app cold-launches via the Live Activity, the socket isn't connected
  // yet. We queue the leave emit here and flush it once connect() fires.
  const pendingLeaveGroupIdRef = useRef<string | null>(null);

  // End every Live Activity owned by this app, not just the one we last
  // tracked. The native module ends ALL activities when called with an empty
  // string — that catches orphans left behind by rapid channel switches,
  // restoration paths where the in-memory ref was lost, or an interrupted
  // start whose then-callback never landed an ID into liveActivityIdRef.
  // Without this the lock screen accumulates duplicate cards (one per join)
  // even after we believe we cleaned up.
  const endLiveActivity = useCallback(() => {
    const prevId = liveActivityIdRef.current;
    liveActivityService.end(null); // null → '' → end-all
    liveActivityIdRef.current = null;
    mmkvStorage.delete(LIVE_ACTIVITY_ID_KEY);
    clientLog('liveActivity:end', 'Live Activity ended', { activityId: prevId });
  }, []);

  // On mount: capture device context once so every subsequent log event carries
  // enough information to reconstruct the environment in Railway without a Mac.
  useEffect(() => {
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Device = require('expo-device');
        setClientContext({
          sessionId:   SESSION_ID,
          platform:    Platform.OS,
          osVersion:   Platform.Version,
          deviceModel: Device.modelName ?? 'unknown',
          deviceBrand: Device.brand ?? 'unknown',
        });
      } catch {
        setClientContext({ sessionId: SESSION_ID, platform: Platform.OS, osVersion: Platform.Version });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount: if any PTT session artifacts were persisted from a previous process
  // run and we are not currently connected, the session ended abnormally (typical
  // case: user force-closed the app, then tapped the Live Activity to reopen it).
  // Dismiss the pill, leave the native PTT channel that iOS auto-restored, and
  // queue a ptt:leave for when the socket reconnects — otherwise the server keeps
  // the user in the room indefinitely.
  useEffect(() => {
    (async () => {
      // Apple: "Initialize the channel manager as soon as possible during
      // startup to ensure the framework can restore existing channels and
      // deliver push notifications to the app." Without this preinit, an
      // active PTT channel that iOS persisted across app relaunches (e.g.
      // after a crash) cannot be restored — the framework needs a live
      // channelManager + restorationDelegate before it will fire the
      // restoration path. The call is idempotent.
      //
      // MUST await: leaveChannel below calls requestLeaveChannelWithUUID on
      // _channelManager. If preinit hasn't finished, _channelManager is nil
      // and the leave is a silent no-op — the Dynamic Island stays stuck.
      await nativePTTService.preinit().catch(() => null);

      if (usePTTStore.getState().isConnected) return;

      const storedActivityId = mmkvStorage.getString(LIVE_ACTIVITY_ID_KEY);
      const storedGroupId    = mmkvStorage.getString(PTT_GROUP_ID_KEY);
      const storedChannelId  = mmkvStorage.getString(PTT_CHANNEL_ID_KEY);

      if (storedActivityId) {
        liveActivityService.end(storedActivityId);
        mmkvStorage.delete(LIVE_ACTIVITY_ID_KEY);
      }
      if (storedChannelId && USE_NATIVE_PTT) {
        // nativePTTChannelIdRef is null at mount — the resulting onPTTChannelLeft
        // for the stale channel is caught by the isStale check in the handler.
        nativePTTService.leaveChannel(storedChannelId).catch(() => null);
        mmkvStorage.delete(PTT_CHANNEL_ID_KEY);
      }
      if (storedGroupId) {
        pendingLeaveGroupIdRef.current = storedGroupId;
        mmkvStorage.delete(PTT_GROUP_ID_KEY);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush any pending ptt:leave once the socket becomes available.
  useEffect(() => {
    if (!socket) return;
    const flush = () => {
      const pending = pendingLeaveGroupIdRef.current;
      if (!pending) return;
      pendingLeaveGroupIdRef.current = null;
      socket.emit('ptt:leave', { groupId: pending });
    };
    if (!socket.connected) {
      socket.once('connect', flush);
      return () => { socket.off('connect', flush); };
    }
    flush();
    return undefined;
  }, [socket]);

  // ─── React to showLiveActivity toggle changes mid-session ──────────────────
  useEffect(() => {
    if (!store.isConnected) return;
    if (store.config.showLiveActivity) {
      // Only start if not already running AND native PTT isn't owning the system UI
      if (!liveActivityIdRef.current && !nativePTTActiveRef.current) {
        const orgName = useAuthStore.getState().organization?.name ?? 'GatherSafe';
        liveActivityService.start(store.currentGroupName ?? '', orgName)
          .then((id) => {
            liveActivityIdRef.current = id;
            if (id) mmkvStorage.setString(LIVE_ACTIVITY_ID_KEY, id);
          })
          .catch(() => null);
      }
    } else {
      // User turned it OFF — end the running Live Activity immediately
      endLiveActivity();
    }
  }, [store.config.showLiveActivity]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── iOS native PTT setup ───────────────────────────────────────────────────
  // Registered ONCE ([] deps) so callbacks are never torn down mid-transmission.
  // All socket access goes through socketRef.current so reconnects are transparent.
  useEffect(() => {
    if (!USE_NATIVE_PTT) return;

    // Transmission started from the native PTT framework (Dynamic Island, lock screen,
    // Bluetooth accessory) — NOT from the in-app PTT button (which calls startTransmitting()).
    const unsubStart = nativePTTService.onTransmissionStarted(({ source }) => {
      const { pttState, currentGroupId } = usePTTStore.getState();
      clientLog('ptt:delegate:didBeginTransmitting', `source=${source}`, {
        source,
        pttState,
        groupId: currentGroupId,
        channelUUID: nativePTTChannelIdRef.current,
        alreadyTransmitting: pttState === 'transmitting',
      });
      if (pttState === 'transmitting') return;
      beginTransmit(/* ownedByNativeButton */ true);
      usePTTStore.getState().setTransmitting(true);
      // ptt:start is emitted in onAudioActivated so egress begins only after
      // the mic is confirmed live — prevents silent recordings.
      console.info(`[PTT] transmission started via ${source}`);
    });

    // Transmission ended from ANY source
    const unsubEnd = nativePTTService.onTransmissionEnded((_) => {
      const { currentGroupId, pttState } = usePTTStore.getState();
      const durationMs = Date.now() - transmitStateRef.current.startedAt;
      clientLog('ptt:delegate:didEndTransmitting', 'delegate fired', {
        groupId: currentGroupId,
        channelUUID: nativePTTChannelIdRef.current,
        pttStateBefore: pttState,
        startEmittedBefore: transmitStateRef.current.startEmitted,
        durationMs,
        stopAlreadyCalled: stopTransmittingCalledRef.current,
      });
      // stopTransmitting() (in-app button release) or the reconnect handler
      // already called endTransmit() and sent ptt:stop. Consuming the flag
      // here prevents this late delegate from wiping a rapid re-press's state.
      if (stopTransmittingCalledRef.current) {
        stopTransmittingCalledRef.current = false;
        transmitCooldownUntilRef.current = Date.now() + 200;
        return;
      }
      endTransmit();
      transmitCooldownUntilRef.current = Date.now() + 200;
      if (pttState !== 'transmitting') return;
      usePTTStore.getState().setTransmitting(false);
      if (micTrackRef.current) { micTrackRef.current.mute(); } else { roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => null); }
      // Clear Live Activity immediately — must not be gated on socket state
      const st = usePTTStore.getState();
      liveActivityService.update(liveActivityIdRef.current, {
        channelName: st.currentGroupName ?? '',
        speakerName: null,
        lastSpeakerName: lastSpeakerNameRef.current,
        isTransmitting: false,
        memberCount: st.connectedMemberIds.length,
        alertLevel: null,
      });
      if (currentGroupId) {
        const stopBody = broadcastToAllRef.current ? { broadcastToAll: true } : undefined;
        pttPost(currentGroupId, 'stop', stopBody).catch(() => null);
        // On iOS native PTT we rely on LiveKit server-side egress for audio.
        // Just send metadata; server attaches the egress URL via egress_ended webhook.
        pttPost(currentGroupId, 'native-log', { durationMs }).catch(() => null);
      }
    });

    // Transmission failed (e.g. active cellular call)
    const unsubFail = nativePTTService.onTransmissionFailed((_channelId, error) => {
      const { currentGroupId, pttState } = usePTTStore.getState();
      clientLog('ptt:delegate:onPTTError', error, {
        channelId: _channelId,
        activeChannelUUID: nativePTTChannelIdRef.current,
        groupId: currentGroupId,
        pttStateBefore: pttState,
        wasTransmitting: transmitStateRef.current.isTransmitting,
      });
      usePTTStore.getState().setTransmitting(false);
      endTransmit();
      transmitCooldownUntilRef.current = Date.now() + 200;
      pttRecorderService.cancel();
      // Clear the Live Activity — startTransmitting already set isTransmitting:true,
      // but stopTransmitting returns early (wasTransmitting=false) once this handler
      // resets state, so we must clear it here or the lock-screen card stays stuck
      // on "speaking" indefinitely.
      const st = usePTTStore.getState();
      liveActivityService.update(liveActivityIdRef.current, {
        channelName: st.currentGroupName ?? '',
        speakerName: null,
        lastSpeakerName: lastSpeakerNameRef.current,
        isTransmitting: false,
        memberCount: st.connectedMemberIds.length,
        alertLevel: null,
      });
      console.warn('[PTT] transmission failed:', error);
    });

    // iOS activates audio session — now safe to open mic or play audio
    const unsubActivated = nativePTTService.onAudioActivated(() => {
      const { currentGroupId } = usePTTStore.getState();
      clientLog('ptt:delegate:didActivateAudioSession', 'session activated', {
        isTransmitting: transmitStateRef.current.isTransmitting,
        startEmitted: transmitStateRef.current.startEmitted,
        groupId: currentGroupId,
        channelUUID: nativePTTChannelIdRef.current,
      });
      if (transmitStateRef.current.isTransmitting) {
        // Unmute first so the LiveKit track is live before server starts egress
        if (micTrackRef.current) { micTrackRef.current.unmute(); } else { roomRef.current?.localParticipant.setMicrophoneEnabled(true).catch(() => null); }
        // HTTP ptt:start after audio session is confirmed live.
        // Using HTTP instead of socket because the iOS audio session handoff
        // reliably breaks the WebSocket at this moment — HTTP uses a fresh TCP
        // connection so it reaches the server regardless of socket state.
        // Guard prevents double-emit when startTransmitting already fired it
        // (foreground case where audio session was already active).
        if (currentGroupId && !transmitStateRef.current.startEmitted) {
          markStartEmitted();
          const startBody: Record<string, unknown> = {};
          if (broadcastToAllRef.current) startBody.broadcastToAll = true;
          pttPost(currentGroupId, 'start', Object.keys(startBody).length ? startBody : undefined).catch(() => null);
        }
      }
      // For incoming audio, LiveKit auto-plays subscribed tracks — nothing to do here
    });

    // iOS deactivates audio session after a framework-initiated transmission ends
    // (Dynamic Island, lock-screen, or hardware accessory press). Mute the mic and
    // leave session ownership with the PTT framework — calling startAudioSession()
    // here re-activates AVAudioSession under the framework's feet, iOS detects the
    // conflict and ends the PTT channel, which is why subsequent Dynamic Island
    // presses fail until the user re-joins the channel from the app.
    const unsubDeactivated = nativePTTService.onAudioDeactivated(() => {
      clientLog('ptt:delegate:didDeactivateAudioSession', 'session deactivated', {
        channelUUID: nativePTTChannelIdRef.current,
      });
      if (micTrackRef.current) { micTrackRef.current.mute(); } else { roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => null); }
    });

    // System closed the channel.
    //
    // The native module emits this for every onPTTChannelLeft, including
    // stale leaves for previous-session UUIDs queued by iOS during
    // initialize(). The channelId guard below filters those out: with
    // fresh per-join UUIDs, the leaving UUID for a stale event won't
    // match nativePTTChannelIdRef.current (which is the active session's
    // UUID), so we early-return without disconnecting.
    //
    // A 3-second grace window is opened in joinChannel so system-initiated
    // leaves landing immediately after join are suppressed without consuming
    // a one-shot flag.
    const unsubLeft = nativePTTService.onChannelLeft((channelId, reason) => {
      const isStale = !nativePTTChannelIdRef.current || channelId !== nativePTTChannelIdRef.current;
      const graceWindowActive = Date.now() < joinGraceWindowUntilRef.current;
      clientLog('ptt:delegate:didLeaveChannel', `stale=${isStale} reason=${reason}`, {
        leavingChannelId: channelId,
        activeChannelUUID: nativePTTChannelIdRef.current,
        reason,
        graceWindowActive,
      });
      // Stale leaves for previous-session UUIDs land here harmlessly: the
      // active channel UUID is different, so we early-return. No disconnect.
      if (isStale) {
        return;
      }
      // System-initiated leave within the post-join grace window. iOS fires
      // multiple didLeaveChannelWithUUID events during rapid channel switching
      // and from the native self-heal cascade. The 3-second window absorbs all
      // of them; events with reason "user" or "systemUI" bypass it so a real
      // Dynamic Island leave always takes effect immediately.
      if (reason === 'system' && graceWindowActive) {
        return;
      }

      intentionalLeaveRef.current = true;
      const { currentGroupId } = usePTTStore.getState();
      const s = socketRef.current;
      if (s && currentGroupId) {
        s.emit('ptt:leave', { groupId: currentGroupId });
      }
      roomRef.current?.disconnect();
      roomRef.current = null;
      nativePTTChannelIdRef.current = null;
      // Clean up any active lead broadcast room so it doesn't trigger another
      // audio session conflict after the PTT channel has already been vacated.
      if (leadBroadcastDisconnectTimerRef.current) {
        clearTimeout(leadBroadcastDisconnectTimerRef.current);
        leadBroadcastDisconnectTimerRef.current = null;
      }
      if (leadBroadcastRoomRef.current) {
        leadBroadcastRoomRef.current.disconnect();
        leadBroadcastRoomRef.current = null;
      }
      usePTTStore.getState().disconnect();
      // Native PTT path never called startAudioSession itself, so there is
      // nothing to stop here — the framework deactivated its own session
      // already as part of the channel-leave sequence.
      endLiveActivity();
      mmkvStorage.delete(PTT_GROUP_ID_KEY);
      mmkvStorage.delete(PTT_CHANNEL_ID_KEY);
    });

    return () => {
      unsubStart();
      unsubEnd();
      unsubFail();
      unsubActivated();
      unsubDeactivated();
      unsubLeft();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Android: CallKit / ConnectionService setup ─────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    callKitService.setup();
    callKitService.onEndCall(() => {
      intentionalLeaveRef.current = true;
      const { currentGroupId } = usePTTStore.getState();
      if (socket && currentGroupId) {
        socket.emit('ptt:leave', { groupId: currentGroupId });
      }
      roomRef.current?.disconnect();
      roomRef.current = null;
      callUUIDRef.current = null;
      usePTTStore.getState().disconnect();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── BLE PTT accessories ────────────────────────────────────────────────────
  useEffect(() => {
    bluetoothPTTService.init();
  }, []);

  // ─── Socket listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleSpeaking = (data: {
      groupId: string;
      userId: string;
      displayName: string;
      startedAt: string;
      fromLeadGroup?: boolean;
    }) => {
      // Ignore echoes of our own transmission — the server's HTTP broadcast path
      // uses io.to(room) which can reach our own socket before the exclusion filter
      // kicks in on slow connections.
      const localUserId = useAuthStore.getState().user?.id;
      if (data.userId === localUserId) return;

      // Lead broadcast: sub-group member dynamically connects to the lead room
      // so they can hear the audio. Cancelled disconnect timer if one is pending.
      if (data.fromLeadGroup && Platform.OS !== 'web') {
        if (leadBroadcastDisconnectTimerRef.current) {
          clearTimeout(leadBroadcastDisconnectTimerRef.current);
          leadBroadcastDisconnectTimerRef.current = null;
        }
        if (!leadBroadcastRoomRef.current && Room && RoomEvent) {
          pttService.getLeadRoomToken(data.groupId)
            .then(async (res) => {
              if (leadBroadcastRoomRef.current) return; // already connected by parallel call
              const bRoom = new Room({ dynacast: false });
              bRoom.on(RoomEvent.Disconnected, () => { leadBroadcastRoomRef.current = null; });
              await bRoom.connect(res.livekitUrl || ENV.livekitUrl, res.token, { autoSubscribe: true });
              leadBroadcastRoomRef.current = bRoom;
              console.info(`[PTT] Connected to lead broadcast room ${res.groupName} (listen-only)`);
            })
            .catch((err) => console.warn('[PTT] Failed to join lead broadcast room:', err));
        }
      }

      usePTTStore.getState().setActiveSpeaker({
        userId: data.userId,
        displayName: data.displayName,
        startedAt: data.startedAt,
      });
      // Update Dynamic Island / lock screen with speaker name (iOS native PTT)
      if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
        nativePTTService.setActiveRemoteParticipant(
          nativePTTChannelIdRef.current,
          data.displayName,
        ).catch(() => null);
      }
      if (usePTTStore.getState().config.vibrateOnReceive) {
        Vibration.vibrate(100);
      }
      // Update Live Activity to show who is speaking
      lastSpeakerNameRef.current = data.displayName;
      const { currentGroupName, connectedMemberIds } = usePTTStore.getState();
      liveActivityService.update(liveActivityIdRef.current, {
        channelName: currentGroupName ?? '',
        speakerName: data.displayName,
        lastSpeakerName: data.displayName,
        isTransmitting: false,
        memberCount: connectedMemberIds.length,
        alertLevel: null,
      });
    };

    const handleStopped = (data?: { fromLeadGroup?: boolean }) => {
      // Schedule disconnect from the temporary lead broadcast room after a short
      // idle window so rapid multi-transmission broadcasts don't reconnect every time.
      if (data?.fromLeadGroup && leadBroadcastRoomRef.current) {
        if (leadBroadcastDisconnectTimerRef.current) clearTimeout(leadBroadcastDisconnectTimerRef.current);
        leadBroadcastDisconnectTimerRef.current = setTimeout(() => {
          leadBroadcastDisconnectTimerRef.current = null;
          leadBroadcastRoomRef.current?.disconnect();
          leadBroadcastRoomRef.current = null;
        }, 5000); // 5s grace: lead admin may transmit again quickly
      }
      usePTTStore.getState().setActiveSpeaker(null);
      // Clear system UI speaker indicator
      if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
        nativePTTService.clearActiveRemoteParticipant(nativePTTChannelIdRef.current).catch(() => null);
      }
      // Clear Live Activity speaker (keep lastSpeakerName so card shows "Last: X")
      const { currentGroupName, connectedMemberIds } = usePTTStore.getState();
      liveActivityService.update(liveActivityIdRef.current, {
        channelName: currentGroupName ?? '',
        speakerName: null,
        lastSpeakerName: lastSpeakerNameRef.current,
        isTransmitting: false,
        memberCount: connectedMemberIds.length,
        alertLevel: null,
      });
    };

    const handleMemberJoined = (data: { userId: string }) => {
      usePTTStore.getState().addConnectedMember(data.userId);
    };

    const handleMemberLeft = (data: { userId: string }) => {
      usePTTStore.getState().removeConnectedMember(data.userId);
    };

    const handleRoomState = (data: { memberIds: string[] }) => {
      usePTTStore.getState().setConnectedMembers(data.memberIds);
    };

    const handleAudioChunk = (data: { chunk: ArrayBuffer; mimeType: string }) => {
      if (Platform.OS !== 'web') return;
      const blob = new Blob([data.chunk], { type: data.mimeType });
      const url = URL.createObjectURL(blob);
      const audio = new window.Audio(url);
      audio.play().catch(() => null);
      audio.onended = () => URL.revokeObjectURL(url);
    };

    const handleLogSaved = (data: {
      id?: string;
      groupId: string;
      userId: string;
      displayName?: string;
      audioUrl: string;
      durationMs?: number;
      createdAt: string;
    }) => {
      usePTTLogStore.getState().prependLog({
        id: data.id ?? `${data.userId}_${data.createdAt}`,
        groupId: data.groupId,
        senderId: data.userId,
        audioUrl: data.audioUrl,
        durationMs: data.durationMs ?? 0,
        createdAt: data.createdAt,
        sender: { id: data.userId, displayName: data.displayName ?? 'Team member', avatarUrl: null },
      });
    };

    const handleLogUpdated = (data: { id: string; groupId: string; audioUrl: string }) => {
      usePTTLogStore.getState().updateLogAudioUrl(data.id, data.groupId, data.audioUrl);
    };

    const handleSocketReconnect = () => {
      const { currentGroupId, isConnected, pttState } = usePTTStore.getState();
      // Any ptt:speaking / ptt:stopped events we missed during the disconnection
      // are gone — reset so the UI doesn't stay stuck in RECEIVING.
      usePTTStore.getState().setActiveSpeaker(null);

      // If the socket dropped mid-transmission the server already ended the
      // session via its disconnect handler. Reset client state to match —
      // without this, pttState stays 'transmitting' and every subsequent press
      // is silently blocked by the "already transmitting" guard, leaving the
      // user unable to key up until the 45-second safety timeout fires.
      if (transmitStateRef.current.isTransmitting || pttState === 'transmitting') {
        if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
          // Arm the flag so the late-arriving onTransmissionEnded delegate
          // (which iOS may still deliver after stopTransmitting) doesn't wipe
          // state for the next fresh transmission.
          stopTransmittingCalledRef.current = true;
          nativePTTService.stopTransmitting(nativePTTChannelIdRef.current).catch(() => null);
        }
        endTransmit();
        usePTTStore.getState().setTransmitting(false);
        if (micTrackRef.current) micTrackRef.current.mute();
        else roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => null);
      }

      if (isConnected && currentGroupId) {
        socket.emit('ptt:join', { groupId: currentGroupId });
        if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
          nativePTTService.setServiceStatus(nativePTTChannelIdRef.current, 'ready').catch(() => null);
        }
      }
    };

    // Notify system UI about connectivity changes
    const handleSocketDisconnect = () => {
      const { currentGroupId, pttState } = usePTTStore.getState();
      clientLog('socket:disconnect', 'socket disconnected', {
        groupId: currentGroupId,
        pttState,
        isTransmitting: transmitStateRef.current.isTransmitting,
        channelUUID: nativePTTChannelIdRef.current,
      });
      forceFlush(); // flush before transport is down
      if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
        nativePTTService.setServiceStatus(nativePTTChannelIdRef.current, 'connecting').catch(() => null);
      }
    };

    socket.on('ptt:speaking',     handleSpeaking);
    socket.on('ptt:stopped',      handleStopped);
    socket.on('ptt:member_joined', handleMemberJoined);
    socket.on('ptt:member_left',  handleMemberLeft);
    socket.on('ptt:room_state',   handleRoomState);
    socket.on('ptt:audio_chunk',  handleAudioChunk);
    socket.on('ptt:log_saved',    handleLogSaved);
    socket.on('ptt:log_updated',  handleLogUpdated);
    socket.on('connect',          handleSocketReconnect);
    socket.on('disconnect',       handleSocketDisconnect);

    return () => {
      socket.off('ptt:speaking',     handleSpeaking);
      socket.off('ptt:stopped',      handleStopped);
      socket.off('ptt:member_joined', handleMemberJoined);
      socket.off('ptt:member_left',  handleMemberLeft);
      socket.off('ptt:room_state',   handleRoomState);
      socket.off('ptt:audio_chunk',  handleAudioChunk);
      socket.off('ptt:log_saved',    handleLogSaved);
      socket.off('ptt:log_updated',  handleLogUpdated);
      socket.off('connect',          handleSocketReconnect);
      socket.off('disconnect',       handleSocketDisconnect);
    };
  }, [socket]);

  // ─── joinChannel ────────────────────────────────────────────────────────────
  const joinChannel = useCallback(
    async (groupId: string) => {
      clientLog('ptt:js:joinChannel:start', 'invoked', { groupId, socketReady: !!socket });
      if (joinInProgressRef.current) {
        clientLog('ptt:js:joinChannel:skipped', 'aborted — join already in progress');
        return;
      }
      if (!socket) {
        clientLog('ptt:js:joinChannel:noSocket', 'aborted — socket missing');
        return;
      }
      joinInProgressRef.current = true;
      const myGeneration = joinCancelRef.current;
      try {

      // fetchToken can fail (network down, server 4xx/5xx). Without the catch
      // the promise rejects further down with no breadcrumb, and the UI is
      // stuck on a loader forever. Reset to disconnected and re-throw with a
      // useful message so callers can show it.
      const response = await usePTTStore.getState()
        .fetchToken(groupId)
        .catch((err: unknown) => {
          usePTTStore.getState().disconnect();
          const msg = err instanceof Error ? err.message : 'Failed to fetch PTT access token';
          throw new Error(msg);
        });
      usePTTStore.getState().setCurrentGroup(groupId, response.groupName);
      // Persist so a cold launch from the Live Activity can tell the server we left.
      mmkvStorage.setString(PTT_GROUP_ID_KEY, groupId);

      if (Platform.OS === 'web') {
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          usePTTStore.getState().disconnect();
          throw new Error('Microphone permission is required for PTT');
        }
      } else {
        const { granted } = await AudioModule.requestRecordingPermissionsAsync();
        if (!granted) {
          usePTTStore.getState().disconnect();
          throw new Error('Microphone permission is required for PTT');
        }

        // Reset native PTT bookkeeping. The framework channel is joined LAST,
        // after LiveKit pre-publish, because Apple's framework switches WebRTC
        // to manual-audio mode the moment the channel is registered. Trying
        // to publish a mic track after that switch produces a track that
        // never binds to the hardware capture pipeline — the server records
        // a small file but real-time WebRTC frames to peers are silent.
        nativePTTActiveRef.current = false;
        // Null out the channel ref BEFORE joining so any stale onPTTChannelLeft event
        // that fires during this join window (e.g. from mount-time leaveChannel cleanup
        // of a previous session with the same channel ID) is safely ignored.
        nativePTTChannelIdRef.current = null;

        // Start the Live Activity for the lock screen status regardless of whether
        // native PTT is active. When native PTT IS active, the PTT framework takes
        // priority in the Dynamic Island (transmit button), but it provides no lock
        // screen expanded view — our Live Activity fills that gap.
        //
        // Tear down any previously-running activity FIRST. Without this, switching
        // from the lead group to a sub-group leaves the lead activity alive while
        // the new one starts: the lock screen shows two cards and the Dynamic
        // Island pill snaps to whichever started most recently. End-all (in
        // endLiveActivity) clears every owned activity, so the next start is
        // unambiguous.
        if (usePTTStore.getState().config.showLiveActivity) {
          endLiveActivity();
          const orgName = useAuthStore.getState().organization?.name ?? 'GatherSafe';
          liveActivityService.start(response.groupName, orgName)
            .then((id) => {
              liveActivityIdRef.current = id;
              if (id) mmkvStorage.setString(LIVE_ACTIVITY_ID_KEY, id);
              clientLog('liveActivity:start', id ? 'Live Activity started' : 'Live Activity start returned null', {
                groupId, activityId: id, groupName: response.groupName,
              });
            })
            .catch((err) => {
              clientLog('liveActivity:startError', 'Live Activity start threw', {
                groupId, error: err instanceof Error ? err.message : String(err),
              });
            });
        }

        if (Platform.OS === 'android' && !USE_NATIVE_PTT) {
          // ── Android: ConnectionService keeps audio alive in background ────
          await new Promise<void>((resolve) => {
            const uuid = callKitService.startCall(response.groupName, () => resolve());
            callUUIDRef.current = uuid;
            setTimeout(resolve, 2000);
          });
        }

        // ── Connect to LiveKit room (both iOS and Android) ───────────────────
        const livekitUrl = response.livekitUrl || ENV.livekitUrl;
        if (!livekitUrl) {
          if (Platform.OS === 'android' && callUUIDRef.current) {
            callKitService.endCall(callUUIDRef.current);
            callUUIDRef.current = null;
          }
          usePTTStore.getState().disconnect();
          throw new Error('LiveKit server URL is not configured. Set LIVEKIT_URL on the server.');
        }

        // Audio session is unconditionally activated here so createLocalAudioTrack
        // can bind to the real mic hardware. WebRTC is still in default
        // (auto-managed) mode — useManualAudio doesn't flip to YES until the
        // PTT channel is joined further below. The session is then released
        // (for native PTT) or kept active (Android / web fallback) so the
        // framework can take over per-transmission activation cleanly.
        AudioSession?.startAudioSession();

        const room = new Room!({
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          dynacast: false,
        });
        roomRef.current = room;

        room.on(RoomEvent!.ParticipantConnected, (participant: { identity: string }) => {
          usePTTStore.getState().addConnectedMember(participant.identity);
        });

        room.on(RoomEvent!.ParticipantDisconnected, (participant: { identity: string }) => {
          usePTTStore.getState().removeConnectedMember(participant.identity);
        });

        room.on(RoomEvent!.ActiveSpeakersChanged, (speakers: Array<{ identity: string; name?: string }>) => {
          // Only SET the speaker here — never CLEAR it. LiveKit fires this with
          // an empty array whenever audio drops below its VAD threshold, which
          // happens even while someone is still holding the PTT button (silence
          // between words). Clearing here causes RECEIVING to flicker off mid-hold.
          // The ptt:stopped socket event is the authoritative signal to clear.
          const remote = speakers.find((s) => s.identity !== room.localParticipant?.identity);
          if (remote) {
            usePTTStore.getState().setActiveSpeaker({
              userId: remote.identity,
              displayName: remote.name ?? remote.identity,
              startedAt: new Date().toISOString(),
            });
            // Notify the native PTT framework so it activates the audio session
            // for playback — this is the fallback path when the ptt:speaking socket
            // event was missed (e.g. socket ping-timeout during the transmission).
            if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
              nativePTTService.setActiveRemoteParticipant(
                nativePTTChannelIdRef.current,
                remote.name ?? remote.identity,
              ).catch(() => null);
            }
          }
        });

        room.on(RoomEvent!.Reconnecting, () => {
          console.warn('[PTT] LiveKit reconnecting...');
          clientLog('livekit:reconnecting', 'LiveKit room reconnecting', {
            groupId,
            channelUUID: nativePTTChannelIdRef.current,
            isTransmitting: transmitStateRef.current.isTransmitting,
          });
          if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
            nativePTTService.setServiceStatus(nativePTTChannelIdRef.current, 'connecting').catch(() => null);
          }
        });

        room.on(RoomEvent!.Reconnected, () => {
          console.info('[PTT] LiveKit reconnected');
          clientLog('livekit:reconnected', 'LiveKit room reconnected', {
            groupId,
            channelUUID: nativePTTChannelIdRef.current,
          });
          if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
            nativePTTService.setServiceStatus(nativePTTChannelIdRef.current, 'ready').catch(() => null);
          }
          // After a full peer-connection teardown and rebuild the LiveKit SDK
          // re-publishes tracks internally, but the LocalAudioTrack object in
          // micTrackRef may now refer to a sender that no longer belongs to the
          // new PeerConnection (logcat: "Sender does not belong to this peer
          // connection"). Re-publish it if it's no longer in the participant's
          // publication map, so the next PTT press has a live track.
          if (micTrackRef.current && createLocalAudioTrack) {
            const pubs = [...room.localParticipant.trackPublications.values()];
            const stillPublished = pubs.some((p) => p.track === micTrackRef.current);
            if (!stillPublished) {
              const wasTransmitting = transmitStateRef.current.isTransmitting;
              clientLog('livekit:reconnected:republish', 'mic track lost after reconnect — re-publishing');
              room.localParticipant.publishTrack(micTrackRef.current, { dtx: true })
                .then(() => { if (!wasTransmitting) micTrackRef.current?.mute(); })
                .catch(async () => {
                  // Old track is truly dead — create a fresh one
                  try {
                    const newTrack = await createLocalAudioTrack!({
                      echoCancellation: true, noiseSuppression: true, autoGainControl: true,
                    });
                    await room.localParticipant.publishTrack(newTrack, { dtx: true });
                    if (!wasTransmitting) newTrack.mute();
                    micTrackRef.current = newTrack;
                    clientLog('livekit:reconnected:republish:fresh', 'fresh mic track published after reconnect');
                  } catch (trackErr) {
                    clientLog('livekit:reconnected:republish:failed', 'mic re-publish failed — PTT unavailable until rejoin');
                    console.warn('[PTT] Mic re-publish after reconnect failed:', trackErr);
                    micTrackRef.current = null;
                  }
                });
            }
          }
        });

        room.on(RoomEvent!.Disconnected, () => {
          micTrackRef.current = null; // room cleanup releases the underlying track
          clientLog('livekit:disconnected', 'LiveKit room disconnected', {
            groupId,
            intentional: intentionalLeaveRef.current,
            sessionAgeMs: Date.now() - joinedAtRef.current,
            isTransmitting: transmitStateRef.current.isTransmitting,
          });
          forceFlush();
          if (intentionalLeaveRef.current) {
            intentionalLeaveRef.current = false;
            usePTTStore.getState().disconnect();
            // Only call stopAudioSession on the non-native path — native PTT
            // already handed session ownership to Apple's framework and the
            // framework deactivates it as part of the channel-leave flow.
            if (!USE_NATIVE_PTT) {
              AudioSession?.stopAudioSession();
            }
            return;
          }

          // Unintentional disconnect. LiveKit auto-reconnects transient
          // network blips on its own (Reconnecting → Reconnected); reaching
          // this handler means reconnect failed for good. The most common
          // cause for a long-running PTT session is an expired access token
          // (LiveKit issues them for ~6h by default). Try a transparent
          // rejoin once when the session is old enough that a refresh is
          // plausible — otherwise preserve the existing short-session
          // behaviour of just clearing the active speaker.
          const sessionAgeMs = Date.now() - joinedAtRef.current;
          const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 60 * 1000; // 5h
          const groupIdToRejoin = usePTTStore.getState().currentGroupId;
          if (
            !rejoinInFlightRef.current &&
            groupIdToRejoin &&
            sessionAgeMs > TOKEN_REFRESH_THRESHOLD_MS
          ) {
            rejoinInFlightRef.current = true;
            console.info('[PTT] Long-session LiveKit disconnect — rejoining for fresh token');
            // Defer to the next tick so the in-flight Disconnected handler
            // unwinds before we tear the room down again.
            setTimeout(() => {
              try { leaveChannelRef.current?.(); } catch { /* ignore */ }
              setTimeout(() => {
                joinChannelRef.current?.(groupIdToRejoin)
                  .catch((err) => console.warn('[PTT] Auto-rejoin failed:', err))
                  .finally(() => { rejoinInFlightRef.current = false; });
              }, 250);
            }, 0);
            return;
          }

          // Unintentional short-session disconnect. LiveKit's built-in reconnect
          // already exhausted all retries before firing this event. Reset to the
          // fully-disconnected state so the UI shows the group picker — otherwise
          // isConnected stays true with a dead room and PTT presses are silently
          // swallowed (root cause of the Android channel-switch "break and doesn't
          // recover" bug: both rooms ping-timed-out simultaneously, Disconnected
          // fired, but only activeSpeaker was cleared, not isConnected).
          if (!USE_NATIVE_PTT) AudioSession?.stopAudioSession();
          usePTTStore.getState().disconnect();
        });

        // room.connect rejection is the most common silent failure on bad
        // network. Tear down the half-open join and surface the error to the
        // caller; otherwise the UI sits with the connecting indicator forever
        // and onTransmissionStarted runs on a dead room.
        try {
          await room.connect(livekitUrl, response.token, { autoSubscribe: true });
          joinedAtRef.current = Date.now();
        } catch (err) {
          roomRef.current = null;
          if (Platform.OS === 'android' && callUUIDRef.current) {
            callKitService.endCall(callUUIDRef.current);
            callUUIDRef.current = null;
          }
          AudioSession?.stopAudioSession();
          usePTTStore.getState().disconnect();
          mmkvStorage.delete(PTT_GROUP_ID_KEY);
          mmkvStorage.delete(PTT_CHANNEL_ID_KEY);
          const msg = err instanceof Error ? err.message : 'Failed to connect to voice channel';
          throw new Error(msg);
        }

        // Pre-publish mic track muted with DTX for instant unmute on first press.
        // CRITICAL: this MUST happen before nativePTTService.joinChannel below,
        // because that call switches WebRTC into manual-audio mode. A track
        // created in manual-audio mode without an explicitly-active session
        // never binds to the mic — the published track exists but carries no
        // audio frames to peers, even after the framework later activates the
        // session for a transmission. Wrapped in try-catch: on first launch
        // iOS may not have provisioned the session yet, fall back to on-demand.
        try {
          const micTrack = await createLocalAudioTrack!({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
          await room.localParticipant.publishTrack(micTrack, { dtx: true });
          micTrack.mute();
          micTrackRef.current = micTrack;
        } catch (trackErr) {
          console.warn('[PTT] Pre-publish mic track failed, will use on-demand enable:', trackErr);
          await room.localParticipant.setMicrophoneEnabled(false).catch(() => null);
        }

        // Lead group: connect to each sub-group room as a listen-only subscriber so
        // lead members can hear sub-group transmissions in real time. These rooms
        // do not publish audio so they do not need the local mic.
        if (response.subGroupRooms && response.subGroupRooms.length > 0) {
          const subRooms = await Promise.allSettled(
            response.subGroupRooms.map(async (sg) => {
              const subRoom = new Room!({ dynacast: false });

              subRoom.on(RoomEvent!.ActiveSpeakersChanged, (speakers: Array<{ identity: string; name?: string }>) => {
                const remote = speakers.find((s) => s.identity !== subRoom.localParticipant?.identity);
                if (remote) {
                  usePTTStore.getState().setActiveSpeaker({
                    userId: remote.identity,
                    displayName: remote.name ?? remote.identity,
                    startedAt: new Date().toISOString(),
                  });
                  // Same fallback as the main room handler — activate the iOS audio
                  // session via the PTT framework when the socket event was missed.
                  if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
                    nativePTTService.setActiveRemoteParticipant(
                      nativePTTChannelIdRef.current,
                      remote.name ?? remote.identity,
                    ).catch(() => null);
                  }
                }
                // Don't clear activeSpeaker on silence — the main room or another sub-room
                // may have a live speaker; only the main room's handler clears it.
              });

              subRoom.on(RoomEvent!.Disconnected, () => {
                // LiveKit exhausted all reconnect retries. Remove the dead room from the
                // list so leaveChannel() doesn't try to disconnect it again, and so a
                // future Lead-group rejoin can create a fresh room without stale state.
                subRoomsRef.current = subRoomsRef.current.filter((r) => r !== subRoom);
                console.warn(`[PTT] Sub-group room permanently disconnected (${sg.groupName}), removed from listener list`);
              });

              await subRoom.connect(livekitUrl, sg.token, { autoSubscribe: true });
              console.info(`[PTT] Connected to sub-group room ${sg.groupName} (listen-only)`);
              return subRoom;
            }),
          );

          subRoomsRef.current = subRooms
            .filter((r) => r.status === 'fulfilled')
            .map((r) => (r as PromiseFulfilledResult<typeof room>).value);

          const failed = subRooms.filter((r) => r.status === 'rejected').length;
          if (failed > 0) console.warn(`[PTT] ${failed} sub-group room(s) failed to connect`);
        }

        // ── Hand audio session ownership to Apple's PTT framework ───────────
        if (USE_NATIVE_PTT) {
          // Release our hold on the AVAudioSession before joining the PTT
          // channel. The pre-published mic track is already bound to the
          // hardware capture pipeline; it stays bound through the deactivation
          // and resumes capture when the framework re-activates the session
          // for a transmission. Without this release, both LiveKit and the
          // PTT framework end up issuing setActive: calls and iOS revokes
          // the channel.
          AudioSession?.stopAudioSession();

          try {
            // Register push token listener BEFORE joinChannel — iOS can fire the
            // token callback within milliseconds of the channel joining, so the
            // listener must already be in place or the token is silently missed.
            let unsubToken: (() => void) | null = null;
            unsubToken = nativePTTService.onPushTokenReceived(async (token) => {
              unsubToken?.();
              unsubToken = null;
              try {
                // Use apiClient so the call inherits the 401-refresh interceptor.
                await apiClient.post(`/ptt/${groupId}/register-token`, { token });
              } catch (err) {
                console.warn('[PTT] Failed to register push token:', err);
              }
            });

            // Generate a fresh UUID per join. iOS uses this UUID as the
            // identity for the PTT channel; with a unique UUID per session,
            // the deferred didLeaveChannelWithUUID iOS queues on initialize()
            // refers to a UUID we no longer care about, so the native
            // self-heal path doesn't have to disambiguate stale-vs-real
            // leaves. joinGraceWindowUntilRef is set below as a defensive net.
            const channelUUID = generateUUIDv4();
            joiningChannelIdRef.current = channelUUID;
            // Persist BEFORE the native join so the UUID survives a force-kill
            // that occurs after iOS shows the Dynamic Island (during channel
            // registration) but before JS could write it post-await. Without
            // this the next cold launch has no stored UUID to call leaveChannel
            // with, leaving the Dynamic Island stuck until iOS times out.
            mmkvStorage.setString(PTT_CHANNEL_ID_KEY, channelUUID);
            joinGraceWindowUntilRef.current = Date.now() + 3000;
            clientLog('ptt:js:joinChannel:nativeInit', 'calling initialize:', {
              groupId,
              channelUUID,
            });

            const resolvedId = await nativePTTService.joinChannel(
              groupId,
              response.groupName,
              channelUUID,
            );
            joiningChannelIdRef.current = null;
            nativePTTChannelIdRef.current = resolvedId;
            nativePTTActiveRef.current = true;
            // resolvedId normally equals channelUUID; update only if they differ
            // (e.g. UUID case normalisation by iOS returning uppercase).
            if (resolvedId && resolvedId !== channelUUID) mmkvStorage.setString(PTT_CHANNEL_ID_KEY, resolvedId);

            // Report service as "ready" in system UI
            nativePTTService.setServiceStatus(resolvedId, 'ready').catch(() => null);
          } catch (nativeErr) {
            // Native PTT framework unavailable on this OS version — fall back
            // to direct LiveKit mode. Reactivate the session because the
            // framework is not going to manage it for us.
            console.warn('[PTT] Native PTT init failed, using direct LiveKit mode:', nativeErr);
            joiningChannelIdRef.current = null;
            nativePTTChannelIdRef.current = null;
            AudioSession?.startAudioSession();
          }
        }
      }

      // If leaveChannel() fired while this join was in flight, it already
      // disconnected the room(s) and reset the store. Don't re-flip isConnected.
      if (joinCancelRef.current !== myGeneration) {
        return;
      }
      socket.emit('ptt:join', { groupId });
      usePTTStore.getState().setConnected(true);
      usePTTStore.getState().fetchParticipants(groupId);
      usePTTLogStore.getState().fetchLogs(groupId);
      clientLog('ptt:js:joinChannel:done', 'joined', {
        groupId,
        channelUUID: nativePTTChannelIdRef.current,
        nativePTTActive: nativePTTActiveRef.current,
      });
      forceFlush(); // ensure join diagnostics land before any transmission starts
      } finally {
        joinInProgressRef.current = false;
      }
    },
    [socket, endLiveActivity],
  );

  // ─── leaveChannel ───────────────────────────────────────────────────────────
  const leaveChannel = useCallback(() => {
    const { currentGroupId, pttState } = usePTTStore.getState();
    clientLog('ptt:js:leaveChannel', 'invoked', {
      groupId: currentGroupId,
      pttState,
      isTransmitting: transmitStateRef.current.isTransmitting,
      channelUUID: nativePTTChannelIdRef.current,
    });
    forceFlush(); // ensure any buffered events land before the socket closes

    // If the user leaves while transmitting, fire an HTTP stop before tearing down.
    // Without this the server-side egress keeps recording until the socket drops and
    // the disconnect handler cleans it up — which can be seconds later.
    if (pttState === 'transmitting' && currentGroupId) {
      pttPost(currentGroupId, 'stop').catch(() => null);
      endTransmit();
      usePTTStore.getState().setTransmitting(false);
    }

    // Always end the Live Activity first — must not be gated on socket/group state
    // because the island can get stuck if the socket is disconnected when leave is pressed.
    endLiveActivity();

    // Cancel any in-flight joinChannel() — without this, a slow join (e.g.
    // Lead group connecting to multiple sub-rooms on Android emulator) can
    // complete after leaveChannel() has already returned to the group picker
    // and call setConnected(true), re-entering a broken connected state.
    joinCancelRef.current += 1;
    joinInProgressRef.current = false;

    intentionalLeaveRef.current = true;

    // Tear down local audio/native resources regardless of socket/group state.
    // When the user taps Leave after opening the app from the Dynamic Island,
    // the socket may be momentarily null (reconnect in flight). Skipping cleanup
    // here leaves the LiveKit room, native PTT channel, and store in a connected
    // state, so the UI never navigates back to the group picker.
    if (Platform.OS === 'web') {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
    } else {
      if (micTrackRef.current) {
        micTrackRef.current.stop();
        micTrackRef.current = null;
      }
      roomRef.current?.disconnect();
      roomRef.current = null;

      // Disconnect all sub-group listen-only rooms
      for (const subRoom of subRoomsRef.current) {
        subRoom.disconnect();
      }
      subRoomsRef.current = [];

      // Disconnect any temporary lead broadcast room (sub-group member during broadcast)
      if (leadBroadcastDisconnectTimerRef.current) {
        clearTimeout(leadBroadcastDisconnectTimerRef.current);
        leadBroadcastDisconnectTimerRef.current = null;
      }
      if (leadBroadcastRoomRef.current) {
        leadBroadcastRoomRef.current.disconnect();
        leadBroadcastRoomRef.current = null;
      }
      // Reset broadcast mode when leaving channel
      broadcastToAllRef.current = false;
      setBroadcastToAll(false);

      if (nativePTTActiveRef.current || joiningChannelIdRef.current) {
        // Use the active channel UUID, or the in-flight join UUID if joinChannel
        // is mid-execution (nativePTTActiveRef is still false in that gap).
        const channelToLeave = nativePTTChannelIdRef.current ?? joiningChannelIdRef.current;
        if (channelToLeave) {
          nativePTTService.leaveChannel(channelToLeave).catch(() => null);
          nativePTTChannelIdRef.current = null;
          joiningChannelIdRef.current = null;
        }
        nativePTTActiveRef.current = false;
      } else if (Platform.OS === 'android') {
        if (callUUIDRef.current) {
          callKitService.endCall(callUUIDRef.current);
          callUUIDRef.current = null;
        }
      }
      pttRecorderService.cancel();
      // Only stop the LiveKit-managed audio session if we started one. Native
      // PTT delegates session ownership to Apple's framework, which has
      // already deactivated its session as part of the channel-leave path.
      if (!USE_NATIVE_PTT) {
        AudioSession?.stopAudioSession();
      }
    }

    const s = socketRef.current ?? socket;
    if (s && currentGroupId) {
      s.emit('ptt:leave', { groupId: currentGroupId });
    }
    // Always reset store — this flips isConnected back to false so the UI
    // can render the group picker and the user isn't stuck on the PTT screen.
    usePTTStore.getState().disconnect();

    // Drop the cold-launch cleanup breadcrumbs — we've already told the server.
    mmkvStorage.delete(PTT_GROUP_ID_KEY);
    mmkvStorage.delete(PTT_CHANNEL_ID_KEY);
  }, [socket, endLiveActivity]);

  // ─── startTransmitting ──────────────────────────────────────────────────────
  const startTransmitting = useCallback(() => {
    const { currentGroupId, pttState } = usePTTStore.getState();
    const ctx = {
      groupId: currentGroupId,
      pttState,
      socketReady: !!(socketRef.current ?? socket),
      socketConnected: (socketRef.current ?? socket)?.connected,
      nativePTTActive: nativePTTActiveRef.current,
      channelUUID: nativePTTChannelIdRef.current,
      startEmitted: transmitStateRef.current.startEmitted,
      isTransmitting: transmitStateRef.current.isTransmitting,
    };
    console.info('[PTT] startTransmitting invoked', ctx);
    clientLog('ptt:js:startTransmitting', 'press received', ctx);
    if (!currentGroupId) {
      console.warn('[PTT] startTransmitting: no current group — user not joined to a channel');
      clientLog('ptt:js:startTransmitting:noGroup', 'aborted — no current group');
      return;
    }
    if (pttState === 'transmitting') {
      clientLog('ptt:js:startTransmitting:alreadyTransmitting', 'aborted — already transmitting');
      return;
    }
    const cooldownRemaining = transmitCooldownUntilRef.current - Date.now();
    if (nativePTTActiveRef.current && cooldownRemaining > 0) {
      clientLog('ptt:js:startTransmitting:cooldown', 'aborted — framework cooldown', { cooldownRemaining });
      return;
    }

    // Optimistically flip the UI to "transmitting" FIRST, so the button turns red
    // the instant the user presses it — independent of socket/native-framework state.
    // Any downstream failure (socket down, native begin rejected) will reset via the
    // appropriate failure callback, but we never want the button stuck green after press.
    // ownedByNativeButton is reset to false here; if this turns out to be a
    // framework-initiated press (Dynamic Island), the onTransmissionStarted
    // handler will have already early-returned by then.
    beginTransmit(/* ownedByNativeButton */ false);
    usePTTStore.getState().setTransmitting(true);

    // 45-second hard stop — prevents a frozen mic if stopTransmitting is never called
    // (e.g. app backgrounded mid-tap, store reset during reconnect, native callback lost).
    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    safetyTimeoutRef.current = setTimeout(() => {
      safetyTimeoutRef.current = null;
      console.warn('[PTT] Safety timeout: force-stopping stuck transmission after 45s');
      // Call the underlying stop logic directly via the store snapshot rather than the
      // closure-captured stopTransmitting (avoids stale-closure issues with the timeout).
      const { currentGroupId: gid } = usePTTStore.getState();
      if (!transmitStateRef.current.isTransmitting && usePTTStore.getState().pttState !== 'transmitting') return;
      endTransmit();
      usePTTStore.getState().setTransmitting(false);
      if (micTrackRef.current) micTrackRef.current.mute();
      else roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => null);
      if (gid) pttPost(gid, 'stop').catch(() => null);
    }, 45_000);

    const s = socketRef.current ?? socket;
    if (!s) {
      console.warn('[PTT] startTransmitting: socket unavailable — server will not start egress');
    }

    if (Platform.OS === 'web') {
      if (s) s.emit('ptt:start', { groupId: currentGroupId });
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
        const recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = (e) => {
          const s2 = socketRef.current ?? socket;
          if (e.data.size > 0 && s2) {
            e.data.arrayBuffer().then((buf) => {
              s2.emit('ptt:audio_chunk', { groupId: currentGroupId, chunk: buf, mimeType });
            });
          }
        };
        recorder.start(200);
        mediaRecorderRef.current = recorder;
      }).catch(() => null);
    } else if (nativePTTActiveRef.current) {
      if (nativePTTChannelIdRef.current) {
        // Delegate to Apple's PTT framework even for in-app button presses.
        //
        // Earlier code called AudioSession.startAudioSession() and unmuted the
        // LiveKit mic directly to avoid Apple's ~100-300 ms activation cycle and
        // the system "begin transmit" tone, but that activates AVAudioSession
        // outside the framework's lifecycle while a channel is joined — iOS
        // treats it as a contract violation and revokes the channel on the
        // first transmit (Dynamic Island talk icon disappears, subsequent
        // taps deeplink into the app instead of transmitting).
        //
        // The framework now owns the session: requestBeginTransmitting fires
        // didActivateAudioSession, our native module enables WebRTC audio,
        // and onAudioActivated below unmutes the LiveKit track + posts
        // ptt:start to the server. Slight first-press latency is the price
        // for keeping the channel alive.
        // Re-mark this transmission as native-button-owned (beginTransmit
        // above set it to false on the optimistic flip — overwrite now that
        // we know the framework is going to handle it).
        transmitStateRef.current = {
          ...transmitStateRef.current,
          ownedByNativeButton: true,
        };
        nativePTTService.beginTransmitting(nativePTTChannelIdRef.current).catch((err) => {
          console.warn('[PTT] beginTransmitting failed', err);
          endTransmit();
          usePTTStore.getState().setTransmitting(false);
          transmitCooldownUntilRef.current = Date.now() + 200;
        });
      } else {
        console.warn('[PTT] native PTT active but no channel id — cannot begin transmission');
        endTransmit();
        usePTTStore.getState().setTransmitting(false);
      }
    } else {
      // iOS (PTT framework unavailable or init failed) or Android
      clientLog('ptt:js:startTransmitting:fallback', 'HTTP ptt:start path', { groupId: currentGroupId, platform: Platform.OS, broadcastToAll: broadcastToAllRef.current });
      const startBody: Record<string, unknown> = {};
      if (broadcastToAllRef.current) startBody.broadcastToAll = true;
      pttPost(currentGroupId, 'start', startBody).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[PTT] pttPost start failed:', msg);
        clientLog('ptt:js:startTransmitting:startFailed', msg, { groupId: currentGroupId });
      });
      // markStartEmitted MUST be called here so stopTransmitting sends ptt:stop.
      // On iOS native PTT this is called from onAudioActivated; on Android/fallback
      // there is no equivalent callback so we mark it immediately after dispatching start.
      markStartEmitted();
      if (micTrackRef.current) { micTrackRef.current.unmute(); } else { roomRef.current?.localParticipant.setMicrophoneEnabled(true).catch(() => null); }
      if (Platform.OS === 'android' && callUUIDRef.current) callKitService.setMuted(callUUIDRef.current, false);
      pttRecorderService.start().catch(() => null);
    }
    // Update Live Activity to show "You are speaking"
    const { currentGroupName, connectedMemberIds } = usePTTStore.getState();
    liveActivityService.update(liveActivityIdRef.current, {
      channelName: currentGroupName ?? '',
      speakerName: null,
      lastSpeakerName: lastSpeakerNameRef.current,
      isTransmitting: true,
      memberCount: connectedMemberIds.length,
      alertLevel: null,
    });
  }, [socket]);

  // ─── stopTransmitting ───────────────────────────────────────────────────────
  const stopTransmitting = useCallback(() => {
    const { currentGroupId, pttState } = usePTTStore.getState();
    // Guard on transmitStateRef too: a reconnect can reset the store
    // (pttState → idle) while the mic track remains unmuted — without this
    // check the mic stays live.
    const wasTransmitting = pttState === 'transmitting' || transmitStateRef.current.isTransmitting;
    clientLog('ptt:js:stopTransmitting', 'release received', {
      groupId: currentGroupId,
      pttState,
      wasTransmitting,
      startEmitted: transmitStateRef.current.startEmitted,
      ownedByNativeButton: transmitStateRef.current.ownedByNativeButton,
      nativePTTActive: nativePTTActiveRef.current,
      channelUUID: nativePTTChannelIdRef.current,
    });

    if (!currentGroupId || !wasTransmitting) return;

    // Cancel the safety timeout — we are stopping cleanly.
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }

    // Snapshot the press-lifecycle fields before resetting so we can decide
    // below whether to fire ptt:stop/native-log (only meaningful if start
    // was actually emitted to the server).
    const durationMs = Date.now() - transmitStateRef.current.startedAt;
    const startWasEmitted = transmitStateRef.current.startEmitted;
    endTransmit();
    transmitCooldownUntilRef.current = Date.now() + 200;
    if (pttState === 'transmitting') usePTTStore.getState().setTransmitting(false);

    // Always mute the mic first — this is safe to call even in the stuck-mic scenario
    // where pttState was already reset to idle (e.g. after a reconnect).
    if (micTrackRef.current) {
      micTrackRef.current.mute();
    } else {
      roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => null);
    }

    const s = socketRef.current ?? socket;

    if (Platform.OS === 'web') {
      if (startWasEmitted && s) s.emit('ptt:stop', { groupId: currentGroupId });
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
    } else if (nativePTTActiveRef.current) {
      if (nativePTTChannelIdRef.current) {
        const stopBody = broadcastToAllRef.current ? { broadcastToAll: true } : undefined;
        if (startWasEmitted) pttPost(currentGroupId, 'stop', stopBody).catch(() => null);
        // Arm before calling stopTransmitting so the onTransmissionEnded
        // delegate (fired asynchronously by iOS after the stop call) knows
        // cleanup was already handled and doesn't wipe a rapid re-press's state.
        stopTransmittingCalledRef.current = true;
        // Every native-PTT transmission now goes through the framework
        // (beginTransmitting in startTransmitting), so the framework is
        // always in "transmitting" state on release — call stopTransmitting
        // unconditionally so the framework deactivates its session and the
        // system UI updates. The didDeactivateAudioSession callback then
        // mutes the LiveKit mic via our handler.
        nativePTTService.stopTransmitting(nativePTTChannelIdRef.current).catch(() => null);
        // ownedByNativeButton is already cleared by endTransmit() above.
        if (startWasEmitted) pttPost(currentGroupId, 'native-log', { durationMs }).catch(() => null);
      }
    } else {
      // iOS (PTT framework unavailable or init failed) or Android
      clientLog('ptt:js:stopTransmitting:fallback', 'HTTP ptt:stop path', { groupId: currentGroupId, platform: Platform.OS, startWasEmitted, durationMs });
      const stopBody = broadcastToAllRef.current ? { broadcastToAll: true } : undefined;
      if (startWasEmitted) pttPost(currentGroupId, 'stop', stopBody).catch(() => null);
      if (Platform.OS === 'android' && callUUIDRef.current) callKitService.setMuted(callUUIDRef.current, true);
      if (startWasEmitted) {
        pttRecorderService.stopAndUpload(currentGroupId).then((audioUrl) => {
          pttPost(currentGroupId, 'native-log', { durationMs, ...(audioUrl ? { audioUrl } : {}) }).catch(() => null);
        }).catch(() => {
          pttPost(currentGroupId, 'native-log', { durationMs }).catch(() => null);
        });
      } else {
        pttRecorderService.cancel();
      }
    }
    // Update Live Activity — done transmitting
    const { currentGroupName, connectedMemberIds } = usePTTStore.getState();
    liveActivityService.update(liveActivityIdRef.current, {
      channelName: currentGroupName ?? '',
      speakerName: null,
      lastSpeakerName: lastSpeakerNameRef.current,
      isTransmitting: false,
      memberCount: connectedMemberIds.length,
      alertLevel: null,
    });
  }, [socket]);

  const updateConfig = useCallback((updates: Partial<PTTConfig>) => {
    usePTTStore.getState().updateConfig(updates);
  }, []);

  // Keep the rejoin refs pointed at the latest callbacks. The LiveKit
  // Disconnected handler registered inside joinChannel reaches into these
  // refs (rather than referencing joinChannel/leaveChannel by name from a
  // TDZ-y enclosing scope) when it needs to refresh the token after a
  // long-session disconnect.
  useEffect(() => {
    joinChannelRef.current  = joinChannel;
    leaveChannelRef.current = leaveChannel;
  }, [joinChannel, leaveChannel]);

  // Hardware / BLE button → same as pressing the on-screen PTT button
  useHardwareButton({
    buttonMapping: store.config.primaryButton,
    enabled: store.isConnected && store.config.primaryButton !== 'screen_button',
    onPress: startTransmitting,
    onRelease: stopTransmitting,
  });

  return (
    <PTTContext.Provider
      value={{
        config: store.config,
        pttState: store.pttState,
        isConnected: store.isConnected,
        isConnecting: store.isConnecting,
        currentGroupId: store.currentGroupId,
        currentGroupName: store.currentGroupName,
        activeSpeaker: store.activeSpeaker,
        connectedMemberCount: store.connectedMemberIds.length,
        connectedParticipants: store.participants.filter((p) =>
          store.connectedMemberIds.includes(p.userId),
        ),
        broadcastToAll,
        startTransmitting,
        stopTransmitting,
        joinChannel,
        leaveChannel,
        updateConfig,
        toggleBroadcastMode,
      }}
    >
      {children}
    </PTTContext.Provider>
  );
}

export function usePTT(): PTTContextType {
  const context = useContext(PTTContext);
  if (!context) {
    throw new Error('usePTT must be used within a PTTProvider');
  }
  return context;
}
