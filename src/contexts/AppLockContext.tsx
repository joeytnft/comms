import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { pinLock } from '@/utils/pinLock';

interface AppLockContextType {
  isLocked: boolean;
  isPinEnabled: boolean;
  unlock: () => void;
  refreshPinStatus: () => Promise<void>;
}

const AppLockContext = createContext<AppLockContextType>({
  isLocked: false,
  isPinEnabled: false,
  unlock: () => {},
  refreshPinStatus: async () => {},
});

// Lock the app after being backgrounded for this long (ms)
const LOCK_AFTER_BACKGROUND_MS = 60 * 1000; // 1 minute

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const [isPinEnabled, setIsPinEnabled] = useState(false);
  const [backgroundedAt, setBackgroundedAt] = useState<number | null>(null);

  const refreshPinStatus = useCallback(async () => {
    const pinSet = await pinLock.isPinSet();
    setIsPinEnabled(pinSet);
    // If PIN was just enabled, lock immediately
    if (pinSet) setIsLocked(true);
    if (!pinSet) setIsLocked(false);
  }, []);

  // Check PIN on mount
  useEffect(() => {
    pinLock.isPinSet().then((pinSet) => {
      setIsPinEnabled(pinSet);
      setIsLocked(pinSet); // Start locked if PIN is set
    });
  }, []);

  // Lock app when it returns from a long background period
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        setBackgroundedAt(Date.now());
      } else if (nextState === 'active') {
        if (isPinEnabled && backgroundedAt !== null) {
          const elapsed = Date.now() - backgroundedAt;
          if (elapsed >= LOCK_AFTER_BACKGROUND_MS) {
            setIsLocked(true);
          }
        }
        setBackgroundedAt(null);
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [isPinEnabled, backgroundedAt]);

  const unlock = useCallback(() => {
    setIsLocked(false);
  }, []);

  return (
    <AppLockContext.Provider value={{ isLocked, isPinEnabled, unlock, refreshPinStatus }}>
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  return useContext(AppLockContext);
}
