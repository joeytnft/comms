/**
 * useHardwareButton
 *
 * Listens for PTT trigger events from:
 *   1. Volume-down key (Android — works without any BT accessory)
 *   2. Bonded BLE HID PTT button via bluetoothPTTService
 *
 * Calls onPress / onRelease when the configured button fires.
 * The hook is a no-op on web.
 */

import { useEffect, useRef } from 'react';
import { Platform, NativeEventEmitter, NativeModules } from 'react-native';
import { bluetoothPTTService } from '@/services/bluetoothPTTService';
import { ButtonMapping } from '@/types/ptt';

interface Options {
  buttonMapping: ButtonMapping;
  enabled: boolean;
  onPress: () => void;
  onRelease: () => void;
}

export function useHardwareButton({ buttonMapping, enabled, onPress, onRelease }: Options) {
  const pressedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web' || !enabled) return;

    // ── BLE HID button ────────────────────────────────────────────────────────
    if (buttonMapping === 'bluetooth_hid') {
      const unsub = bluetoothPTTService.addListener((event) => {
        if (event === 'press' && !pressedRef.current) {
          pressedRef.current = true;
          onPress();
        } else if (event === 'release' && pressedRef.current) {
          pressedRef.current = false;
          onRelease();
        }
      });
      return unsub;
    }

    // ── Volume key (Android only) ─────────────────────────────────────────────
    // Requires MainActivity.kt to forward dispatchKeyEvent to DeviceEventEmitter.
    // Not available in Expo Go — only works in a development/production build.
    // See docs/PTT_IMPLEMENTATION.md for the one-time native setup.
    if (Platform.OS === 'android' && (buttonMapping === 'volume_up' || buttonMapping === 'volume_down')) {
      const nativeModule = NativeModules.GuardianKeyEvents ?? null;
      if (!nativeModule) {
        // Native key-event module not present (Expo Go or not yet set up) — skip silently
        return;
      }
      const emitter = new NativeEventEmitter(nativeModule);
      const targetKeyCode = buttonMapping === 'volume_down' ? 25 : 24; // KEYCODE_VOLUME_DOWN / UP

      const downSub = emitter.addListener('keyDown', (e: { keyCode: number }) => {
        if (e.keyCode === targetKeyCode && !pressedRef.current) {
          pressedRef.current = true;
          onPress();
        }
      });

      const upSub = emitter.addListener('keyUp', (e: { keyCode: number }) => {
        if (e.keyCode === targetKeyCode && pressedRef.current) {
          pressedRef.current = false;
          onRelease();
        }
      });

      return () => {
        downSub.remove();
        upSub.remove();
      };
    }
  }, [buttonMapping, enabled, onPress, onRelease]);
}
