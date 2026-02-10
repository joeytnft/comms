import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { secureStorage } from '@/utils/secureStorage';
import { ENV } from '@/config/env';
import { ACCESS_TOKEN_KEY, SOCKET_RECONNECT_ATTEMPTS, SOCKET_RECONNECT_DELAY } from '@/config/constants';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    let mounted = true;

    async function connect() {
      const token = await secureStorage.getItemAsync(ACCESS_TOKEN_KEY);
      if (!token || !mounted) return;

      const socket = io(ENV.socketUrl, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: SOCKET_RECONNECT_ATTEMPTS,
        reconnectionDelay: SOCKET_RECONNECT_DELAY,
      });

      socket.on('connect', () => {
        if (mounted) setIsConnected(true);
      });

      socket.on('disconnect', () => {
        if (mounted) setIsConnected(false);
      });

      socket.on('connect_error', (error) => {
        console.warn('[Socket] Connection error:', error.message);
      });

      socketRef.current = socket;
    }

    connect();

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isAuthenticated]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextType {
  return useContext(SocketContext);
}
