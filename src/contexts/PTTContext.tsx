import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { Vibration } from 'react-native';
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

  // Set up socket listeners for PTT events
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

      // Vibrate on receive
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

    const handleRoomState = (data: {
      groupId: string;
      connectedMembers: number;
      memberIds: string[];
    }) => {
      usePTTStore.getState().setConnectedMembers(data.memberIds);
    };

    socket.on('ptt:speaking', handleSpeaking);
    socket.on('ptt:stopped', handleStopped);
    socket.on('ptt:member_joined', handleMemberJoined);
    socket.on('ptt:member_left', handleMemberLeft);
    socket.on('ptt:room_state', handleRoomState);

    return () => {
      socket.off('ptt:speaking', handleSpeaking);
      socket.off('ptt:stopped', handleStopped);
      socket.off('ptt:member_joined', handleMemberJoined);
      socket.off('ptt:member_left', handleMemberLeft);
      socket.off('ptt:room_state', handleRoomState);
    };
  }, [socket]);

  const joinChannel = useCallback(
    async (groupId: string) => {
      if (!socket) return;

      // Fetch token from server (validates membership + subscription)
      const response = await usePTTStore.getState().fetchToken(groupId);
      usePTTStore.getState().setCurrentGroup(groupId, response.groupName);

      // Request audio permissions
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        usePTTStore.getState().disconnect();
        throw new Error('Microphone permission is required for PTT');
      }

      // Set audio mode for PTT
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      // Join the PTT socket room for signaling
      socket.emit('ptt:join', { groupId });
      usePTTStore.getState().setConnected(true);

      // Fetch participant list
      usePTTStore.getState().fetchParticipants(groupId);
    },
    [socket],
  );

  const leaveChannel = useCallback(() => {
    const currentGroupId = usePTTStore.getState().currentGroupId;
    if (!socket || !currentGroupId) return;

    socket.emit('ptt:leave', { groupId: currentGroupId });
    usePTTStore.getState().disconnect();
  }, [socket]);

  const startTransmitting = useCallback(() => {
    const { currentGroupId, pttState } = usePTTStore.getState();
    if (!socket || !currentGroupId || pttState === 'transmitting') return;

    usePTTStore.getState().setTransmitting(true);
    socket.emit('ptt:start', { groupId: currentGroupId });
  }, [socket]);

  const stopTransmitting = useCallback(() => {
    const { currentGroupId, pttState } = usePTTStore.getState();
    if (!socket || !currentGroupId || pttState !== 'transmitting') return;

    usePTTStore.getState().setTransmitting(false);
    socket.emit('ptt:stop', { groupId: currentGroupId });
  }, [socket]);

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
