import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import { Audio } from 'expo-av';
import { PTTState, PTTConfig } from '@/types';
import { useSocket } from './SocketContext';
import { usePTTStore } from '@/store/usePTTStore';

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

  // Native recording ref
  const recordingRef = useRef<Audio.Recording | null>(null);

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

    socket.on('ptt:speaking', handleSpeaking);
    socket.on('ptt:stopped', handleStopped);
    socket.on('ptt:member_joined', handleMemberJoined);
    socket.on('ptt:member_left', handleMemberLeft);
    socket.on('ptt:room_state', handleRoomState);
    socket.on('ptt:audio_chunk', handleAudioChunk);

    return () => {
      socket.off('ptt:speaking', handleSpeaking);
      socket.off('ptt:stopped', handleStopped);
      socket.off('ptt:member_joined', handleMemberJoined);
      socket.off('ptt:member_left', handleMemberLeft);
      socket.off('ptt:room_state', handleRoomState);
      socket.off('ptt:audio_chunk', handleAudioChunk);
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
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) {
          usePTTStore.getState().disconnect();
          throw new Error('Microphone permission is required for PTT');
        }
        await Audio.setAudioModeAsync({
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
      recordingRef.current?.stopAndUnloadAsync().catch(() => null);
      recordingRef.current = null;
    }
  }, []);

  const startTransmitting = useCallback(() => {
    const { currentGroupId, pttState } = usePTTStore.getState();
    if (!socket || !currentGroupId || pttState === 'transmitting') return;

    usePTTStore.getState().setTransmitting(true);
    socket.emit('ptt:start', { groupId: currentGroupId });

    if (Platform.OS === 'web') {
      // Web: use MediaRecorder to capture and stream audio chunks
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';

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
      // Native: use expo-av Recording
      Audio.Recording.createAsync(Audio.RecordingOptionsPresets.LOW_QUALITY)
        .then(({ recording }) => {
          recordingRef.current = recording;
        })
        .catch(() => null);
    }
  }, [socket]);

  const stopTransmitting = useCallback(() => {
    const { currentGroupId, pttState } = usePTTStore.getState();
    if (!socket || !currentGroupId || pttState !== 'transmitting') return;

    usePTTStore.getState().setTransmitting(false);
    socket.emit('ptt:stop', { groupId: currentGroupId });
    stopAudio();
  }, [socket, stopAudio]);

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
