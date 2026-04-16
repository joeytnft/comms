import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import { AudioModule } from '@/utils/audioStub';
import { PTTState, PTTConfig } from '@/types';
import { ENV } from '@/config/env';
import { useSocket } from './SocketContext';
import { usePTTStore } from '@/store/usePTTStore';
import { usePTTLogStore } from '@/store/usePTTLogStore';
import { useHardwareButton } from '@/hooks/useHardwareButton';
import { backgroundService } from '@/services/backgroundService';
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
  // Set to true when the user deliberately calls leaveChannel so we don't auto-rejoin
  const intentionalLeaveRef = useRef(false);

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
    // so speaking/stopped events keep flowing.  LiveKit stays connected independently.
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

        // Start iOS/Android audio session
        await AudioSession?.startAudioSession();

        // Create and connect LiveKit room
        const room = new Room!();
        roomRef.current = room;

        // Wire up LiveKit events
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
          // Only tear down fully if the user deliberately left; network drops
          // are handled by LiveKit's own reconnect logic (Reconnecting → Reconnected).
          // If we end up here it means reconnection was exhausted or we left intentionally.
          if (intentionalLeaveRef.current) {
            intentionalLeaveRef.current = false;
            usePTTStore.getState().disconnect();
            AudioSession?.stopAudioSession();
          } else {
            // Unexpected disconnect — keep isConnected true so the UI shows "reconnecting"
            // state rather than kicking the user out of the channel entirely.
            usePTTStore.getState().setActiveSpeaker(null);
            AudioSession?.stopAudioSession();
          }
        });

        const livekitUrl = response.livekitUrl || ENV.livekitUrl;
        if (!livekitUrl) {
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
      backgroundService.startForegroundNotification(response.groupName).catch(() => null);
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
    }

    socket.emit('ptt:leave', { groupId: currentGroupId });
    usePTTStore.getState().disconnect();
    backgroundService.stopForegroundNotification().catch(() => null);
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
      // Unmute mic in LiveKit room — audio streams instantly to all participants
      roomRef.current?.localParticipant.setMicrophoneEnabled(true).catch(() => null);
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
