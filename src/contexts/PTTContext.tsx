import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react';
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
import { secureStorage } from '@/utils/secureStorage';
import { mmkvStorage } from '@/utils/mmkv';
import { ACCESS_TOKEN_KEY } from '@/config/constants';
import { ENV as AppEnv } from '@/config/env';

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
  const lk = require('livekit-client');
  Room = lk.Room;
  RoomEvent = lk.RoomEvent;
  createLocalAudioTrack = lk.createLocalAudioTrack;
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
  startTransmitting: () => void;
  stopTransmitting: () => void;
  joinChannel: (groupId: string) => Promise<void>;
  leaveChannel: () => void;
  updateConfig: (config: Partial<PTTConfig>) => void;
}

const PTTContext = createContext<PTTContextType | undefined>(undefined);

export function PTTProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket();
  const store = usePTTStore();

  // LiveKit room instance (native)
  const roomRef = useRef<InstanceType<typeof import('livekit-client').Room> | null>(null);
  // Pre-published mic track kept muted between transmissions for instant PTT response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const micTrackRef = useRef<any>(null);

  // Web MediaRecorder ref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // Track when transmit started so durationMs is accurate
  const transmitStartedAtRef = useRef<number>(0);
  // CallKit call UUID for the current PTT session (Android only)
  const callUUIDRef = useRef<string | null>(null);
  // Active PTT channel UUID (iOS native PTT)
  const nativePTTChannelIdRef = useRef<string | null>(null);
  // Set to true when the user deliberately calls leaveChannel
  const intentionalLeaveRef = useRef(false);
  // True while we are between "transmission started" and audio session activated
  const transmittingRef = useRef(false);
  // True only when native PTT framework successfully joined a channel this session
  const nativePTTActiveRef = useRef(false);
  // Live Activity ID for the current PTT session (iOS 16.2+)
  const liveActivityIdRef = useRef<string | null>(null);
  // Set once per transmission, so we never emit ptt:start twice when both
  // startTransmitting (foreground) and onAudioActivated (background/island) fire.
  const pttStartEmittedRef = useRef(false);

  // Always-current socket ref so native PTT callbacks (registered once) can emit
  // even when the socket reconnects and the `socket` variable changes identity.
  const socketRef = useRef(socket);
  useEffect(() => { socketRef.current = socket; }, [socket]);

  // When the app cold-launches via the Live Activity, the socket isn't connected
  // yet. We queue the leave emit here and flush it once connect() fires.
  const pendingLeaveGroupIdRef = useRef<string | null>(null);

  // End the Live Activity, falling back to the MMKV-persisted ID if the in-memory
  // ref was lost (e.g. process was killed and restarted by iOS in the background).
  const endLiveActivity = useCallback(() => {
    const id = liveActivityIdRef.current ?? mmkvStorage.getString(LIVE_ACTIVITY_ID_KEY) ?? null;
    liveActivityService.end(id);
    liveActivityIdRef.current = null;
    mmkvStorage.delete(LIVE_ACTIVITY_ID_KEY);
  }, []);

  // On mount: if any PTT session artifacts were persisted from a previous process
  // run and we are not currently connected, the session ended abnormally (typical
  // case: user force-closed the app, then tapped the Live Activity to reopen it).
  // Dismiss the pill, leave the native PTT channel that iOS auto-restored, and
  // queue a ptt:leave for when the socket reconnects — otherwise the server keeps
  // the user in the room indefinitely.
  useEffect(() => {
    if (usePTTStore.getState().isConnected) return;

    const storedActivityId = mmkvStorage.getString(LIVE_ACTIVITY_ID_KEY);
    const storedGroupId    = mmkvStorage.getString(PTT_GROUP_ID_KEY);
    const storedChannelId  = mmkvStorage.getString(PTT_CHANNEL_ID_KEY);

    if (storedActivityId) {
      liveActivityService.end(storedActivityId);
      mmkvStorage.delete(LIVE_ACTIVITY_ID_KEY);
    }
    if (storedChannelId && USE_NATIVE_PTT) {
      nativePTTService.leaveChannel(storedChannelId).catch(() => null);
      mmkvStorage.delete(PTT_CHANNEL_ID_KEY);
    }
    if (storedGroupId) {
      pendingLeaveGroupIdRef.current = storedGroupId;
      mmkvStorage.delete(PTT_GROUP_ID_KEY);
    }
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
    if (socket.connected) {
      flush();
    } else {
      socket.once('connect', flush);
      return () => { socket.off('connect', flush); };
    }
  }, [socket]);

  // ─── React to showLiveActivity toggle changes mid-session ──────────────────
  useEffect(() => {
    if (!store.isConnected) return;
    if (store.config.showLiveActivity) {
      // User turned it ON while already connected — start one now if none running
      if (!liveActivityIdRef.current) {
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

    // Transmission started from ANY source (screen, lock screen, Bluetooth accessory)
    const unsubStart = nativePTTService.onTransmissionStarted(({ source }) => {
      const { pttState } = usePTTStore.getState();
      if (pttState === 'transmitting') return;
      transmittingRef.current = true;
      transmitStartedAtRef.current = Date.now();
      usePTTStore.getState().setTransmitting(true);
      // ptt:start is emitted in onAudioActivated so egress begins only after
      // the mic is confirmed live — prevents silent recordings.
      console.info(`[PTT] transmission started via ${source}`);
    });

    // Transmission ended from ANY source
    const unsubEnd = nativePTTService.onTransmissionEnded((_) => {
      const { currentGroupId, pttState } = usePTTStore.getState();
      transmittingRef.current = false;
      pttStartEmittedRef.current = false;
      if (pttState !== 'transmitting') return;
      const durationMs = Date.now() - transmitStartedAtRef.current;
      usePTTStore.getState().setTransmitting(false);
      if (micTrackRef.current) { micTrackRef.current.mute(); } else { roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => null); }
      // Clear Live Activity immediately — must not be gated on socket state
      const st = usePTTStore.getState();
      liveActivityService.update(liveActivityIdRef.current, {
        channelName: st.currentGroupName ?? '',
        speakerName: null,
        isTransmitting: false,
        memberCount: st.connectedMemberIds.length,
        alertLevel: null,
      });
      const s = socketRef.current;
      if (s && currentGroupId) {
        s.emit('ptt:stop', { groupId: currentGroupId });
        // On iOS native PTT we rely on LiveKit server-side egress for audio
        // (expo-av contends with LiveKit for the mic and uploads empty files).
        // Just send the metadata; server attaches the egress URL when it completes.
        s.emit('ptt:native_log', { groupId: currentGroupId, durationMs });
      }
    });

    // Transmission failed (e.g. active cellular call)
    const unsubFail = nativePTTService.onTransmissionFailed((_channelId, error) => {
      usePTTStore.getState().setTransmitting(false);
      transmittingRef.current = false;
      pttRecorderService.cancel();
      console.warn('[PTT] transmission failed:', error);
    });

    // iOS activates audio session — now safe to open mic or play audio
    const unsubActivated = nativePTTService.onAudioActivated(() => {
      if (transmittingRef.current) {
        const { currentGroupId } = usePTTStore.getState();
        // Unmute first so the LiveKit track is live before server starts egress
        if (micTrackRef.current) { micTrackRef.current.unmute(); } else { roomRef.current?.localParticipant.setMicrophoneEnabled(true).catch(() => null); }
        // Emit ptt:start if startTransmitting hasn't already done it. iOS only
        // fires didActivateAudioSession reliably from background/island — in the
        // foreground the session is often already active and this callback is
        // skipped, which is why egress stopped starting when pressing the main
        // channel button. startTransmitting now emits ptt:start too; this guard
        // prevents a double-emit.
        const s = socketRef.current;
        if (s && currentGroupId && !pttStartEmittedRef.current) {
          pttStartEmittedRef.current = true;
          s.emit('ptt:start', { groupId: currentGroupId });
        }
      }
      // For incoming audio, LiveKit auto-plays subscribed tracks — nothing to do here
    });

    // iOS deactivates audio session — mute mic, stop any recording
    const unsubDeactivated = nativePTTService.onAudioDeactivated(() => {
      if (micTrackRef.current) { micTrackRef.current.mute(); } else { roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => null); }
    });

    // System closed the channel (user left from Dynamic Island / lock screen)
    const unsubLeft = nativePTTService.onChannelLeft(() => {
      intentionalLeaveRef.current = true;
      const { currentGroupId } = usePTTStore.getState();
      const s = socketRef.current;
      if (s && currentGroupId) {
        s.emit('ptt:leave', { groupId: currentGroupId });
      }
      roomRef.current?.disconnect();
      roomRef.current = null;
      nativePTTChannelIdRef.current = null;
      usePTTStore.getState().disconnect();
      AudioSession?.stopAudioSession();
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
    }) => {
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
      const { currentGroupName, connectedMemberCount } = usePTTStore.getState();
      liveActivityService.update(liveActivityIdRef.current, {
        channelName: currentGroupName ?? '',
        speakerName: data.displayName,
        isTransmitting: false,
        memberCount: connectedMemberCount,
        alertLevel: null,
      });
    };

    const handleStopped = () => {
      usePTTStore.getState().setActiveSpeaker(null);
      // Clear system UI speaker indicator
      if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
        nativePTTService.clearActiveRemoteParticipant(nativePTTChannelIdRef.current).catch(() => null);
      }
      // Clear Live Activity speaker
      const { currentGroupName, connectedMemberCount } = usePTTStore.getState();
      liveActivityService.update(liveActivityIdRef.current, {
        channelName: currentGroupName ?? '',
        speakerName: null,
        isTransmitting: false,
        memberCount: connectedMemberCount,
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
      const { currentGroupId, isConnected } = usePTTStore.getState();
      if (isConnected && currentGroupId) {
        socket.emit('ptt:join', { groupId: currentGroupId });
        // Re-report service status after reconnect
        if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
          nativePTTService.setServiceStatus(nativePTTChannelIdRef.current, 'ready').catch(() => null);
        }
      }
    };

    // Notify system UI about connectivity changes
    const handleSocketDisconnect = () => {
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
      if (!socket) return;

      const response = await usePTTStore.getState().fetchToken(groupId);
      usePTTStore.getState().setCurrentGroup(groupId, response.groupName);
      // Persist so a cold launch from the Live Activity can tell the server we left.
      mmkvStorage.setString(PTT_GROUP_ID_KEY, groupId);

      // Start the Live Activity pill (iOS 16.2+, no-op elsewhere; respects user preference)
      if (usePTTStore.getState().config.showLiveActivity) {
        const orgName = useAuthStore.getState().organization?.name ?? 'GatherSafe';
        liveActivityService.start(response.groupName, orgName)
          .then((id) => {
            liveActivityIdRef.current = id;
            if (id) mmkvStorage.setString(LIVE_ACTIVITY_ID_KEY, id);
          })
          .catch(() => null);
      }

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

        // ── iOS: Apple native PTT framework ──────────────────────────────────
        nativePTTActiveRef.current = false;
        if (USE_NATIVE_PTT) {
          try {
            // requestJoinChannel returns the resolved UUID
            const resolvedId = await nativePTTService.joinChannel(groupId, response.groupName);
            nativePTTChannelIdRef.current = resolvedId;
            nativePTTActiveRef.current = true;
            if (resolvedId) mmkvStorage.setString(PTT_CHANNEL_ID_KEY, resolvedId);

            // Register the ephemeral push token with the server once it arrives
            const unsubToken = nativePTTService.onPushTokenReceived(async (token) => {
              unsubToken();
              try {
                const accessToken = await secureStorage.getItemAsync(ACCESS_TOKEN_KEY);
                await fetch(`${AppEnv.apiUrl}/ptt/${groupId}/register-token`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                  },
                  body: JSON.stringify({ token }),
                });
              } catch (err) {
                console.warn('[PTT] Failed to register push token:', err);
              }
            });

            // Report service as "ready" in system UI
            nativePTTService.setServiceStatus(resolvedId, 'ready').catch(() => null);
          } catch (nativeErr) {
            // Native PTT framework unavailable on this OS version — fall through to
            // direct LiveKit mode so PTT still works without system UI integration.
            console.warn('[PTT] Native PTT init failed, using direct LiveKit mode:', nativeErr);
            nativePTTChannelIdRef.current = null;
          }
        }

        if (!nativePTTActiveRef.current && Platform.OS === 'android') {
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
          if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
            await nativePTTService.leaveChannel(nativePTTChannelIdRef.current);
            nativePTTChannelIdRef.current = null;
          } else if (Platform.OS === 'android' && callUUIDRef.current) {
            callKitService.endCall(callUUIDRef.current);
            callUUIDRef.current = null;
          }
          usePTTStore.getState().disconnect();
          throw new Error('LiveKit server URL is not configured. Set LIVEKIT_URL on the server.');
        }

        // For direct LiveKit mode (no native PTT framework), we own the audio session.
        // Native PTT path skips this — iOS activates/deactivates via onAudioActivated.
        if (!nativePTTActiveRef.current) {
          AudioSession?.startAudioSession();
        }

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
          const remote = speakers.find((s) => s.identity !== room.localParticipant?.identity);
          if (remote) {
            usePTTStore.getState().setActiveSpeaker({
              userId: remote.identity,
              displayName: remote.name ?? remote.identity,
              startedAt: new Date().toISOString(),
            });
          } else {
            usePTTStore.getState().setActiveSpeaker(null);
          }
        });

        room.on(RoomEvent!.Reconnecting, () => {
          console.warn('[PTT] LiveKit reconnecting...');
          if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
            nativePTTService.setServiceStatus(nativePTTChannelIdRef.current, 'connecting').catch(() => null);
          }
        });

        room.on(RoomEvent!.Reconnected, () => {
          console.info('[PTT] LiveKit reconnected');
          if (USE_NATIVE_PTT && nativePTTChannelIdRef.current) {
            nativePTTService.setServiceStatus(nativePTTChannelIdRef.current, 'ready').catch(() => null);
          }
        });

        room.on(RoomEvent!.Disconnected, () => {
          micTrackRef.current = null; // room cleanup releases the underlying track
          if (intentionalLeaveRef.current) {
            intentionalLeaveRef.current = false;
            usePTTStore.getState().disconnect();
            AudioSession?.stopAudioSession();
          } else {
            usePTTStore.getState().setActiveSpeaker(null);
          }
        });

        await room.connect(livekitUrl, response.token, { autoSubscribe: true });
        // Pre-publish mic track muted with DTX for instant unmute on first press.
        // Wrapped in try-catch: on first launch iOS may not have the audio session
        // fully provisioned yet — fall back to on-demand enable in that case.
        try {
          const micTrack = await createLocalAudioTrack!({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
          await room.localParticipant.publishTrack(micTrack, { dtx: true, audioBitrate: 16_000 });
          micTrack.mute();
          micTrackRef.current = micTrack;
        } catch (trackErr) {
          console.warn('[PTT] Pre-publish mic track failed, will use on-demand enable:', trackErr);
          await room.localParticipant.setMicrophoneEnabled(false).catch(() => null);
        }
      }

      socket.emit('ptt:join', { groupId });
      usePTTStore.getState().setConnected(true);
      usePTTStore.getState().fetchParticipants(groupId);
    },
    [socket],
  );

  // ─── leaveChannel ───────────────────────────────────────────────────────────
  const leaveChannel = useCallback(() => {
    const currentGroupId = usePTTStore.getState().currentGroupId;

    // Always end the Live Activity first — must not be gated on socket/group state
    // because the island can get stuck if the socket is disconnected when leave is pressed.
    endLiveActivity();

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

      if (nativePTTActiveRef.current) {
        if (nativePTTChannelIdRef.current) {
          nativePTTService.leaveChannel(nativePTTChannelIdRef.current).catch(() => null);
          nativePTTChannelIdRef.current = null;
        }
        nativePTTActiveRef.current = false;
      } else if (Platform.OS === 'android') {
        if (callUUIDRef.current) {
          callKitService.endCall(callUUIDRef.current);
          callUUIDRef.current = null;
        }
      }
      pttRecorderService.cancel();
      AudioSession?.stopAudioSession();
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
    if (!currentGroupId) {
      console.warn('[PTT] startTransmitting: no current group — user not joined to a channel');
      return;
    }
    if (pttState === 'transmitting') return;

    // Optimistically flip the UI to "transmitting" FIRST, so the button turns red
    // the instant the user presses it — independent of socket/native-framework state.
    // Any downstream failure (socket down, native begin rejected) will reset via the
    // appropriate failure callback, but we never want the button stuck green after press.
    transmittingRef.current = true;
    transmitStartedAtRef.current = Date.now();
    usePTTStore.getState().setTransmitting(true);

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
        // Unmute immediately for instant audio.
        if (micTrackRef.current) { micTrackRef.current.unmute(); } else { roomRef.current?.localParticipant.setMicrophoneEnabled(true).catch(() => null); }
        // Emit ptt:start here so LiveKit egress starts for foreground presses.
        // onAudioActivated is unreliable in the foreground (audio session is
        // already active so the framework skips the callback) — this was why
        // main-channel presses produced no egress even though the island did.
        // onAudioActivated still emits as a fallback, guarded by pttStartEmittedRef.
        if (s && !pttStartEmittedRef.current) {
          pttStartEmittedRef.current = true;
          s.emit('ptt:start', { groupId: currentGroupId });
        }
        nativePTTService.beginTransmitting(nativePTTChannelIdRef.current).catch((err) => {
          console.warn('[PTT] native beginTransmitting failed:', err);
        });
      } else {
        console.warn('[PTT] native PTT active but no channel id — cannot begin transmission');
      }
    } else {
      // iOS (PTT framework unavailable or init failed) or Android
      if (s) s.emit('ptt:start', { groupId: currentGroupId });
      if (micTrackRef.current) { micTrackRef.current.unmute(); } else { roomRef.current?.localParticipant.setMicrophoneEnabled(true).catch(() => null); }
      if (Platform.OS === 'android' && callUUIDRef.current) callKitService.setMuted(callUUIDRef.current, false);
      pttRecorderService.start().catch(() => null);
    }
    // Update Live Activity to show "You are speaking"
    const { currentGroupName, connectedMemberCount } = usePTTStore.getState();
    liveActivityService.update(liveActivityIdRef.current, {
      channelName: currentGroupName ?? '',
      speakerName: null,
      isTransmitting: true,
      memberCount: connectedMemberCount,
      alertLevel: null,
    });
  }, [socket]);

  // ─── stopTransmitting ───────────────────────────────────────────────────────
  const stopTransmitting = useCallback(() => {
    const { currentGroupId, pttState } = usePTTStore.getState();
    if (!currentGroupId || pttState !== 'transmitting') return;

    // Always reset the local state on release so the button can't get stuck red.
    const durationMs = Date.now() - transmitStartedAtRef.current;
    transmittingRef.current = false;
    pttStartEmittedRef.current = false;
    usePTTStore.getState().setTransmitting(false);

    const s = socketRef.current ?? socket;

    if (Platform.OS === 'web') {
      if (s) s.emit('ptt:stop', { groupId: currentGroupId });
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
    } else if (nativePTTActiveRef.current) {
      if (nativePTTChannelIdRef.current) {
        if (s) s.emit('ptt:stop', { groupId: currentGroupId });
        if (micTrackRef.current) { micTrackRef.current.mute(); } else { roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => null); }
        nativePTTService.stopTransmitting(nativePTTChannelIdRef.current).catch(() => null);
        // Server-side LiveKit egress handles the audio on iOS native PTT —
        // expo-av recording is skipped because it returned empty files due to
        // mic contention with LiveKit. Just send metadata.
        if (s) s.emit('ptt:native_log', { groupId: currentGroupId, durationMs });
      }
    } else {
      // iOS (PTT framework unavailable or init failed) or Android
      if (s) s.emit('ptt:stop', { groupId: currentGroupId });
      if (micTrackRef.current) { micTrackRef.current.mute(); } else { roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => null); }
      if (Platform.OS === 'android' && callUUIDRef.current) callKitService.setMuted(callUUIDRef.current, true);
      pttRecorderService.stopAndUpload(currentGroupId).then((audioUrl) => {
        if (s) s.emit('ptt:native_log', { groupId: currentGroupId, durationMs, ...(audioUrl ? { audioUrl } : {}) });
      }).catch(() => {
        if (s) s.emit('ptt:native_log', { groupId: currentGroupId, durationMs });
      });
    }
    // Update Live Activity — done transmitting
    const { currentGroupName, connectedMemberCount } = usePTTStore.getState();
    liveActivityService.update(liveActivityIdRef.current, {
      channelName: currentGroupName ?? '',
      speakerName: null,
      isTransmitting: false,
      memberCount: connectedMemberCount,
      alertLevel: null,
    });
  }, [socket]);

  const updateConfig = useCallback((updates: Partial<PTTConfig>) => {
    usePTTStore.getState().updateConfig(updates);
  }, []);

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
        startTransmitting,
        stopTransmitting,
        joinChannel,
        leaveChannel,
        updateConfig,
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
