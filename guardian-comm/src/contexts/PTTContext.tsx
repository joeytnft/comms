import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { PTTState, PTTConfig, PTTSession, DEFAULT_PTT_CONFIG } from '@/types';
import { useSocket } from './SocketContext';

interface PTTContextType {
  config: PTTConfig;
  currentSession: PTTSession | null;
  state: PTTState;
  startTransmitting: (groupId: string) => void;
  stopTransmitting: () => void;
  joinChannel: (groupId: string) => Promise<void>;
  leaveChannel: () => void;
  updateConfig: (config: Partial<PTTConfig>) => void;
}

const PTTContext = createContext<PTTContextType | undefined>(undefined);

export function PTTProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket();
  const [config, setConfig] = useState<PTTConfig>(DEFAULT_PTT_CONFIG);
  const [currentSession, setCurrentSession] = useState<PTTSession | null>(null);
  const [state, setState] = useState<PTTState>('idle');
  const audioStreamRef = useRef<MediaStream | null>(null);

  const startTransmitting = useCallback(
    (groupId: string) => {
      if (state === 'transmitting') return;
      setState('transmitting');

      // TODO: Implement actual audio capture and WebRTC/LiveKit streaming
      // 1. Request microphone access
      // 2. Create audio stream
      // 3. Connect to LiveKit room for the group
      // 4. Publish audio track
      // 5. Notify group via socket that user is transmitting

      socket?.emit('ptt:start', { groupId });
    },
    [state, socket],
  );

  const stopTransmitting = useCallback(() => {
    if (state !== 'transmitting') return;
    setState('idle');

    // TODO: Stop audio capture, unpublish track
    socket?.emit('ptt:stop', { groupId: currentSession?.groupId });
  }, [state, socket, currentSession]);

  const joinChannel = useCallback(
    async (groupId: string) => {
      // TODO: Connect to LiveKit room for this group
      // Generate a LiveKit token from the server
      // Join the room as a subscriber (and publisher when PTT is pressed)
      setCurrentSession({
        groupId,
        groupName: '', // TODO: Resolve from group store
        state: 'idle',
        connectedMembers: 0,
      });
    },
    [socket],
  );

  const leaveChannel = useCallback(() => {
    // TODO: Disconnect from LiveKit room
    setCurrentSession(null);
    setState('idle');
  }, []);

  const updateConfig = useCallback((updates: Partial<PTTConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
    // TODO: Persist config to MMKV
  }, []);

  return (
    <PTTContext.Provider
      value={{
        config,
        currentSession,
        state,
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
