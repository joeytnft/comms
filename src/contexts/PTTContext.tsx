import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import { useAudioRecorder, AudioModule, RecordingPresets } from '@/utils/audioStub';
import { PTTState, PTTConfig } from '@/types';
import { useSocket } from './SocketContext';
import { usePTTStore } from '@/store/usePTTStore';
import { usePTTLogStore } from '@/store/usePTTLogStore';
import { ENV } from '@/config/env';
import { secureStorage } from '@/utils/secureStorage';
import * as FileSystem from '@/utils/fileSystemStub';

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

  // expo-audio recorder (must be called unconditionally — hooks rule)
  const audioRecorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);

  // Web MediaRecorder ref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Socket listeners
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

    // Receive audio chunk from another member (web only)
    const handleAudioChunk = (data: { chunk: ArrayBuffer; mimeType: string }) => {
      if (Platform.OS !== 'web') return;
      const blob = new Blob([data.chunk], { type: data.mimeType });
      const url = URL.createObjectURL(blob);
      const audio = new window.Audio(url);
      audio.play().catch(() => null);
      audio.onended = () => URL.revokeObjectURL(url);
    };

    const handleLogSaved = (data: { groupId: string; userId: string; audioUrl: string; createdAt: string }) => {
      // Will be filled in by usePTTLogStore listener in PTTScreen
      usePTTLogStore.getState().prependLog({
        id: `${data.userId}_${data.createdAt}`,
        groupId: data.groupId,
        senderId: data.userId,
        audioUrl: data.audioUrl,
        durationMs: 0,
        createdAt: data.createdAt,
        sender: { id: data.userId, displayName: 'Team member', avatarUrl: null },
      });
    };

    socket.on('ptt:speaking', handleSpeaking);
    socket.on('ptt:stopped', handleStopped);
    socket.on('ptt:member_joined', handleMemberJoined);
    socket.on('ptt:member_left', handleMemberLeft);
    socket.on('ptt:room_state', handleRoomState);
    socket.on('ptt:audio_chunk', handleAudioChunk);
    socket.on('ptt:log_saved', handleLogSaved);

    return () => {
      socket.off('ptt:speaking', handleSpeaking);
      socket.off('ptt:stopped', handleStopped);
      socket.off('ptt:member_joined', handleMemberJoined);
      socket.off('ptt:member_left', handleMemberLeft);
      socket.off('ptt:room_state', handleRoomState);
      socket.off('ptt:audio_chunk', handleAudioChunk);
      socket.off('ptt:log_saved', handleLogSaved);
    };
  }, [socket]);

  const joinChannel = useCallback(
    async (groupId: string) => {
      if (!socket) return;

      const response = await usePTTStore.getState().fetchToken(groupId);
      usePTTStore.getState().setCurrentGroup(groupId, response.groupName);

      if (Platform.OS === 'web') {
        // Web: check microphone via browser API
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
        await AudioModule.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });
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

    // Stop any in-progress recording
    stopAudio();

    socket.emit('ptt:leave', { groupId: currentGroupId });
    usePTTStore.getState().disconnect();
  }, [socket]);

  const stopAudio = useCallback(() => {
    if (Platform.OS === 'web') {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
    } else {
      audioRecorder?.stop().catch(() => null);
    }
  }, []);

  const startTransmitting = useCallback(() => {
    const { currentGroupId, pttState } = usePTTStore.getState();
    if (!socket || !currentGroupId || pttState === 'transmitting') return;

    usePTTStore.getState().setTransmitting(true);

    if (Platform.OS === 'web') {
      // Web: use MediaRecorder to capture and stream audio chunks
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
        socket.emit('ptt:start', { groupId: currentGroupId, mimeType });

        const recorder = new MediaRecorder(stream, { mimeType });
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && socket) {
            e.data.arrayBuffer().then((buf) => {
              socket.emit('ptt:audio_chunk', { groupId: currentGroupId, chunk: buf, mimeType });
            });
          }
        };

        recorder.start(200); // emit every 200ms
        mediaRecorderRef.current = recorder;
      }).catch(() => null);
    } else {
      socket.emit('ptt:start', { groupId: currentGroupId });
      // Native: set audio mode then record
      AudioModule.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      }).then(() => audioRecorder?.record()).catch(() => null);
    }
  }, [socket]);

  const stopTransmitting = useCallback(() => {
    const { currentGroupId, pttState } = usePTTStore.getState();
    if (!socket || !currentGroupId || pttState !== 'transmitting') return;

    const startedAt = Date.now();
    usePTTStore.getState().setTransmitting(false);
    socket.emit('ptt:stop', { groupId: currentGroupId });

    if (Platform.OS !== 'web' && audioRecorder) {
      audioRecorder.stop().then(() => {
        const uri = audioRecorder.uri;
        if (!uri) return;
        const durationMs = Date.now() - startedAt;
        // Upload native recording and notify server
        (async () => {
          try {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            const token = await secureStorage.getItemAsync('accessToken');
            const uploadRes = await fetch(`${ENV.apiUrl}/upload`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: base64, mimeType: 'audio/m4a' }),
            });
            if (uploadRes.ok) {
              const { url } = await uploadRes.json();
              socket.emit('ptt:native_log', { groupId: currentGroupId, audioUrl: url, durationMs });
            }
          } catch {}
        })();
      }).catch(() => null);
    } else {
      stopAudio();
    }
  }, [socket, stopAudio, audioRecorder]);

  const updateConfig = useCallback((updates: Partial<PTTConfig>) => {
    usePTTStore.getState().updateConfig(updates);
  }, []);

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
