import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import { AudioModule } from '@/utils/audioStub';
import { PTTState, PTTConfig } from '@/types';
import { ENV } from '@/config/env';
import { useSocket } from './SocketContext';
import { usePTTStore } from '@/store/usePTTStore';
import { usePTTLogStore } from '@/store/usePTTLogStore';
import { useHardwareButton } from '@/hooks/useHardwareButton';
import { callKitService } from '@/services/callKitService';
import { bluetoothPTTService } from '@/services/bluetoothPTTService';

// LiveKit (native only — tree-shaken on web)
let Room: typeof import('livekit-client').Room | null = null;
let RoomEvent: typeof import('livekit-client').RoomEvent | null = null;
let AudioSession: typeof import('@livekit/react-native').AudioSession | null = null;
if (Platform.OS !== 'web') {
  const lk = require('livekit-client');
  Room = lk.Room;
  RoomEvent = lk.RoomEvent;
  const rnLk = require('@livekit/react-native');
  AudioSession = rnLk.AudioSession;
}

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

  // Web MediaRecorder ref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // Track when transmit started so durationMs is accurate
  const transmitStartedAtRef = useRef<number>(0);
  // CallKit call UUID for the current PTT session
  const callUUIDRef = useRef<string | null>(null);
  // Set to true when the user deliberately calls leaveChannel so we don't auto-rejoin
  const intentionalLeaveRef = useRef(false);

  // Set up CallKit/ConnectionService once on mount, and wire the OS end-call
  // event to leaveChannel so dismissing from the lock screen works correctly.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    callKitService.setup();
    callKitService.onEndCall(() => {
      // Invoked when user ends the "call" from the iOS lock screen or Android notification
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

  // Init BLE service once on mount
  useEffect(() => {
    bluetoothPTTService.init();
  }, []);

  // Socket listeners (visual indicators + log events — audio handled by LiveKit)
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
      if (usePTTStore.getState().config.vibrateOnReceive) {
        Vibration.vibrate(100);
      }
    };

    const handleStopped = () => {
      usePTTStore.getState().setActiveSpeaker(null);
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

    // Web only: receive audio chunks from other members
    const handleAudioChunk = (data: { chunk: ArrayBuffer; mimeType: string }) => {
      if (Platform.OS !== 'web') return;
      const blob = new Blob([data.chunk], { type: data.mimeType });
      const url = URL.createObjectURL(blob);
      const audio = new window.Audio(url);
      audio.play().catch(() => null);
      audio.onended = () => URL.revokeObjectURL(url);
    };

    const handleLogSaved = (data: {
      groupId: string;
      userId: string;
      displayName?: string;
      audioUrl: string;
      durationMs?: number;
      createdAt: string;
    }) => {
      usePTTLogStore.getState().prependLog({
        id: `${data.userId}_${data.createdAt}`,
        groupId: data.groupId,
        senderId: data.userId,
        audioUrl: data.audioUrl,
        durationMs: data.durationMs ?? 0,
        createdAt: data.createdAt,
        sender: { id: data.userId, displayName: data.displayName ?? 'Team member', avatarUrl: null },
      });
    };

    // When socket reconnects (e.g. after JWT refresh), rejoin the PTT signaling room
    // so speaking/stopped events keep flowing. LiveKit stays connected independently.
    const handleSocketReconnect = () => {
      const { currentGroupId, isConnected } = usePTTStore.getState();
      if (isConnected && currentGroupId) {
        socket.emit('ptt:join', { groupId: currentGroupId });
      }
    };

    socket.on('ptt:speaking', handleSpeaking);
    socket.on('ptt:stopped', handleStopped);
    socket.on('ptt:member_joined', handleMemberJoined);
    socket.on('ptt:member_left', handleMemberLeft);
    socket.on('ptt:room_state', handleRoomState);
    socket.on('ptt:audio_chunk', handleAudioChunk);
    socket.on('ptt:log_saved', handleLogSaved);
    socket.on('connect', handleSocketReconnect);

    return () => {
      socket.off('ptt:speaking', handleSpeaking);
      socket.off('ptt:stopped', handleStopped);
      socket.off('ptt:member_joined', handleMemberJoined);
      socket.off('ptt:member_left', handleMemberLeft);
      socket.off('ptt:room_state', handleRoomState);
      socket.off('ptt:audio_chunk', handleAudioChunk);
      socket.off('ptt:log_saved', handleLogSaved);
      socket.off('connect', handleSocketReconnect);
    };
  }, [socket]);

  const joinChannel = useCallback(
    async (groupId: string) => {
      if (!socket) return;

      // Fetch LiveKit token + room info
      const response = await usePTTStore.getState().fetchToken(groupId);
      usePTTStore.getState().setCurrentGroup(groupId, response.groupName);

      if (Platform.OS === 'web') {
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          usePTTStore.getState().disconnect();
          throw new Error('Microphone permission is required for PTT');
        }
      } else {
        // Request mic permission
        const { granted } = await AudioModule.requestRecordingPermissionsAsync();
        if (!granted) {
          usePTTStore.getState().disconnect();
          throw new Error('Microphone permission is required for PTT');
        }

        // Start a CallKit/ConnectionService call.
        // On iOS this activates the audio session (via didActivateAudioSession) and
        // keeps the process alive in background. On Android it starts the
        // ConnectionService foreground service.
        await new Promise<void>((resolve) => {
          const uuid = callKitService.startCall(response.groupName, () => resolve());
          callUUIDRef.current = uuid;
          // Android fires the callback synchronously, so resolve is already called.
          // iOS fires it via didActivateAudioSession event — give it 2 s max
          // before proceeding anyway so a misconfigured CallKit doesn't block join.
          setTimeout(resolve, 2000);
        });

        // LiveKit room
        const room = new Room!();
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
        });

        room.on(RoomEvent!.Reconnected, () => {
          console.info('[PTT] LiveKit reconnected');
        });

        room.on(RoomEvent!.Disconnected, (reason?: unknown) => {
          console.warn('[PTT] LiveKit disconnected, reason:', reason);
          if (intentionalLeaveRef.current) {
            intentionalLeaveRef.current = false;
            usePTTStore.getState().disconnect();
            AudioSession?.stopAudioSession();
          } else {
            // Unexpected drop — clear speaker state but keep the channel "joined"
            // so the user isn't kicked out on a brief network blip.
            usePTTStore.getState().setActiveSpeaker(null);
          }
        });

        const livekitUrl = response.livekitUrl || ENV.livekitUrl;
        if (!livekitUrl) {
          callKitService.endCall(callUUIDRef.current!);
          callUUIDRef.current = null;
          usePTTStore.getState().disconnect();
          throw new Error('LiveKit server URL is not configured. Set LIVEKIT_URL on the server.');
        }

        await room.connect(livekitUrl, response.token, { autoSubscribe: true });

        // Pre-create mic track in muted state for instant PTT response
        await room.localParticipant.setMicrophoneEnabled(false);
      }

      socket.emit('ptt:join', { groupId });
      usePTTStore.getState().setConnected(true);
      usePTTStore.getState().fetchParticipants(groupId);
    },
    [socket],
  );

  const leaveChannel = useCallback(() => {
    const currentGroupId = usePTTStore.getState().currentGroupId;
    if (!socket || !currentGroupId) return;

    intentionalLeaveRef.current = true;

    if (Platform.OS === 'web') {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
    } else {
      roomRef.current?.disconnect();
      roomRef.current = null;
      // End the CallKit/ConnectionService call — stops the foreground service
      if (callUUIDRef.current) {
        callKitService.endCall(callUUIDRef.current);
        callUUIDRef.current = null;
      }
      AudioSession?.stopAudioSession();
    }

    socket.emit('ptt:leave', { groupId: currentGroupId });
    usePTTStore.getState().disconnect();
  }, [socket]);

  const startTransmitting = useCallback(() => {
    const { currentGroupId, pttState } = usePTTStore.getState();
    if (!socket || !currentGroupId || pttState === 'transmitting') return;

    usePTTStore.getState().setTransmitting(true);
    transmitStartedAtRef.current = Date.now();
    socket.emit('ptt:start', { groupId: currentGroupId });

    if (Platform.OS === 'web') {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
        const recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && socket) {
            e.data.arrayBuffer().then((buf) => {
              socket.emit('ptt:audio_chunk', { groupId: currentGroupId, chunk: buf, mimeType });
            });
          }
        };
        recorder.start(200);
        mediaRecorderRef.current = recorder;
      }).catch(() => null);
    } else {
      // Unmute mic in LiveKit and update CallKit mute indicator on lock screen
      roomRef.current?.localParticipant.setMicrophoneEnabled(true).catch(() => null);
      if (callUUIDRef.current) callKitService.setMuted(callUUIDRef.current, false);
    }
  }, [socket]);

  const stopTransmitting = useCallback(() => {
    const { currentGroupId, pttState } = usePTTStore.getState();
    if (!socket || !currentGroupId || pttState !== 'transmitting') return;

    const durationMs = Date.now() - transmitStartedAtRef.current;
    usePTTStore.getState().setTransmitting(false);
    socket.emit('ptt:stop', { groupId: currentGroupId });

    if (Platform.OS === 'web') {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
    } else {
      // Mute mic — keeps the LiveKit track alive for instant next transmission
      roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => null);
      if (callUUIDRef.current) callKitService.setMuted(callUUIDRef.current, true);
      // Log the transmission duration to server
      socket.emit('ptt:native_log', { groupId: currentGroupId, durationMs });
    }
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
