import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { pinLock } from '@/utils/pinLock';
import { biometricAuth, BiometricType } from '@/utils/biometricAuth';

interface AppLockContextType {
  isLocked: boolean;
  isPinEnabled: boolean;
  isBiometricEnabled: boolean;
  biometricType: BiometricType;
  unlock: () => void;
  tryBiometric: () => Promise<boolean>;
  refreshPinStatus: () => Promise<void>;
  refreshBiometricStatus: () => Promise<void>;
}

const AppLockContext = createContext<AppLockContextType>({
  isLocked: false,
  isPinEnabled: false,
  isBiometricEnabled: false,
  biometricType: null,
  unlock: () => {},
  tryBiometric: async () => false,
  refreshPinStatus: async () => {},
  refreshBiometricStatus: async () => {},
});

// Lock the app after being backgrounded for this long (ms)
const LOCK_AFTER_BACKGROUND_MS = 60 * 1000; // 1 minute

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const [isPinEnabled, setIsPinEnabled] = useState(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>(null);
  const [backgroundedAt, setBackgroundedAt] = useState<number | null>(null);

  const refreshBiometricStatus = useCallback(async () => {
    const [available, enabled, type] = await Promise.all([
      biometricAuth.isAvailable(),
      biometricAuth.isEnabled(),
      biometricAuth.getType(),
    ]);
    setIsBiometricEnabled(available && enabled);
    setBiometricType(available ? type : null);
  }, []);

  const refreshPinStatus = useCallback(async () => {
    const pinSet = await pinLock.isPinSet();
    setIsPinEnabled(pinSet);
    if (pinSet) setIsLocked(true);
    if (!pinSet) setIsLocked(false);
  }, []);

  const tryBiometric = useCallback(async (): Promise<boolean> => {
    if (!isBiometricEnabled) return false;
    const label = biometricType === 'faceId' ? 'Face ID' : 'Touch ID';
    const success = await biometricAuth.authenticate(`Use ${label} to unlock GatherSafe`);
    if (success) setIsLocked(false);
    return success;
  }, [isBiometricEnabled, biometricType]);

  // Initialise on mount
  useEffect(() => {
    Promise.all([
      pinLock.isPinSet(),
      biometricAuth.isAvailable(),
      biometricAuth.isEnabled(),
      biometricAuth.getType(),
    ]).then(([pinSet, bioAvailable, bioEnabled, bioType]) => {
      setIsPinEnabled(pinSet);
      setIsBiometricEnabled(bioAvailable && bioEnabled);
      setBiometricType(bioAvailable ? bioType : null);
      setIsLocked(pinSet); // start locked if PIN is set
    });
  }, []);

  // Auto-attempt biometric when the app locks
  useEffect(() => {
    if (isLocked && isBiometricEnabled) {
      biometricAuth
        .authenticate(
          biometricType === 'faceId'
            ? 'Use Face ID to unlock GatherSafe'
            : 'Use Touch ID to unlock GatherSafe',
        )
        .then((success) => {
          if (success) setIsLocked(false);
        })
        .catch(() => {});
    }
  }, [isLocked, isBiometricEnabled, biometricType]);

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
    <AppLockContext.Provider
      value={{
        isLocked,
        isPinEnabled,
        isBiometricEnabled,
        biometricType,
        unlock,
        tryBiometric,
        refreshPinStatus,
        refreshBiometricStatus,
      }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  return useContext(AppLockContext);
}
