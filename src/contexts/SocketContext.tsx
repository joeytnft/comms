import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { secureStorage } from '@/utils/secureStorage';
import { ENV } from '@/config/env';
import {
  ACCESS_TOKEN_KEY,
  SOCKET_RECONNECT_ATTEMPTS,
  SOCKET_RECONNECT_DELAY,
  SOCKET_RECONNECT_DELAY_MAX,
  SOCKET_RECONNECT_JITTER,
} from '@/config/constants';
import { useAuth } from './AuthContext';
import { useAuthStore } from '@/store/useAuthStore';
import { useAlertStore } from '@/store/useAlertStore';
import { useIncidentStore } from '@/store/useIncidentStore';
import { reportCrash } from '@/utils/logger';

// Decode a JWT's `exp` claim (in seconds since epoch) without verifying the
// signature. Verification is the server's job — we just want to know whether
// to bother sending the current token or refresh it first. Returns null when
// the token is malformed.
function readJwtExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    // Base64URL → base64
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // atom on the global polyfilled by RN; falls back to Buffer/inline decode.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decoded =
      typeof atob === 'function'
        ? atob(payload)
        : (globalThis as any).Buffer?.from(payload, 'base64').toString('binary') ?? '';
    const json = JSON.parse(decoded);
    return typeof json?.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Refresh proactively when the token has < this many ms left. Tuned to be
// larger than the worst-case round trip + reconnect window so we don't burn
// a reconnect attempt on a guaranteed 401.
const TOKEN_REFRESH_LEEWAY_MS = 60_000;

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
        // Cap each individual backoff wait so very long outages don't stretch
        // to multi-minute sleeps between attempts.
        reconnectionDelayMax: SOCKET_RECONNECT_DELAY_MAX,
        randomizationFactor: SOCKET_RECONNECT_JITTER,
      });

      socket.on('connect', () => {
        if (mounted) setIsConnected(true);
      });

      socket.on('disconnect', () => {
        if (mounted) setIsConnected(false);
      });

      // Real-time alert updates
      socket.on('alert:new', (alert) => {
        useAlertStore.getState().addAlert(alert);
      });
      socket.on('alert:acknowledged', ({ alertId, userId }: { alertId: string; userId: string }) => {
        useAlertStore.getState().updateAlertAcknowledgment(alertId, userId);
      });
      socket.on('alert:resolved', ({ alertId, resolvedBy }: { alertId: string; resolvedBy: string }) => {
        useAlertStore.getState().markAlertResolved(alertId, resolvedBy);
      });

      // Real-time incident updates
      socket.on('incident:new', (incident) => {
        useIncidentStore.getState().addIncident(incident);
      });

      // De-duplication guard: while a refresh is in flight we don't want
      // every parallel reconnect_attempt or connect_error to fire its own
      // refresh request and race the others.
      let refreshInFlight: Promise<string | null> | null = null;
      const ensureFreshToken = async (): Promise<string | null> => {
        if (refreshInFlight) return refreshInFlight;
        refreshInFlight = (async () => {
          try {
            await useAuthStore.getState().refreshSession();
            return await secureStorage.getItemAsync(ACCESS_TOKEN_KEY);
          } catch (err) {
            reportCrash({ err, context: 'SocketContext.refreshSession' });
            return null;
          } finally {
            refreshInFlight = null;
          }
        })();
        return refreshInFlight;
      };

      socket.on('connect_error', async (error) => {
        console.warn('[Socket] Connection error:', error.message);
        const lowerMsg = error.message.toLowerCase();
        if (
          lowerMsg.includes('token') ||
          lowerMsg.includes('auth') ||
          lowerMsg.includes('unauthorized')
        ) {
          // Auth-flavoured failure — refresh the token then fall through to
          // the built-in reconnection loop. We do NOT call socket.connect()
          // ourselves here because that races with socket.io-client's own
          // reconnect timer and produces double-connections.
          const fresh = await ensureFreshToken();
          if (fresh && mounted) {
            socket.auth = { token: fresh };
          } else if (mounted) {
            // Refresh failed — the user's session is dead. Stop hammering
            // the server with guaranteed-401 reconnects until the user
            // re-authenticates; AuthContext will fully re-init the socket.
            socket.io.opts.reconnection = false;
          }
        }
      });

      // Refresh the token PROACTIVELY on each reconnect_attempt rather than
      // reactively after a failed handshake. Avoids burning a reconnect on a
      // guaranteed 401 when the token has expired during a long disconnect.
      socket.io.on('reconnect_attempt', async () => {
        const stored = await secureStorage.getItemAsync(ACCESS_TOKEN_KEY);
        if (!stored) return;

        const expMs = readJwtExpiryMs(stored);
        const expired = expMs !== null && expMs - Date.now() < TOKEN_REFRESH_LEEWAY_MS;

        const freshToken = expired ? await ensureFreshToken() : stored;
        if (freshToken) {
          socket.auth = { token: freshToken };
        }
      });

      socketRef.current = socket;
    }

    connect();

    // iOS suspends JS timers when backgrounded, so socket.io's reconnection
    // backoff loop may never fire after a server restart. Force a reconnect
    // attempt whenever the app returns to the foreground.
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'active' && socketRef.current && !socketRef.current.connected) {
        socketRef.current.connect();
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppState);

    return () => {
      mounted = false;
      appStateSub.remove();
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
