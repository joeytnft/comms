import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Vibration,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { useAlertStore } from '@/store/useAlertStore';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY } from '@/config/theme';

const PRIME_TIMEOUT_MS = 3000; // reset to idle after 3s if second tap doesn't come

type ButtonState = 'idle' | 'primed';

export function ActiveShooterButton() {
  const { triggerAlert } = useAlertStore();

  const [buttonState, setButtonState] = useState<ButtonState>('idle');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Pulse animation for the primed state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const primeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = useCallback(() => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
      ]),
    );
    pulseLoop.current.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const resetToIdle = useCallback(() => {
    if (primeTimer.current) clearTimeout(primeTimer.current);
    stopPulse();
    setButtonState('idle');
  }, [stopPulse]);

  const handlePress = useCallback(() => {
    if (isSending) return;

    if (buttonState === 'idle') {
      // First tap — prime it
      Vibration.vibrate(Platform.OS === 'android' ? [0, 80] : 80);
      setButtonState('primed');
      startPulse();
      primeTimer.current = setTimeout(resetToIdle, PRIME_TIMEOUT_MS);
    } else {
      // Second tap — open confirmation modal
      if (primeTimer.current) clearTimeout(primeTimer.current);
      stopPulse();
      Vibration.vibrate(Platform.OS === 'android' ? [0, 80, 80, 80] : [80, 80, 80]);
      setConfirmVisible(true);
    }
  }, [buttonState, isSending, startPulse, stopPulse, resetToIdle]);

  const handleCancel = useCallback(() => {
    setConfirmVisible(false);
    resetToIdle();
  }, [resetToIdle]);

  const handleConfirm = useCallback(async () => {
    setIsSending(true);
    try {
      // Grab the freshest position available; don't block if permission is absent
      let latitude: number | undefined;
      let longitude: number | undefined;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch {
        // Location is best-effort — alert must still fire without it
      }

      await triggerAlert({
        level: 'EMERGENCY',
        alertType: 'ACTIVE_SHOOTER',
        message: 'ACTIVE SHOOTER — All teams respond immediately',
        latitude,
        longitude,
        priorityTone: true,
      });
    } finally {
      setIsSending(false);
      setConfirmVisible(false);
      resetToIdle();
    }
  }, [triggerAlert, resetToIdle]);

  const isPrimed = buttonState === 'primed';

  return (
    <>
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity
          style={[styles.button, isPrimed && styles.buttonPrimed]}
          onPress={handlePress}
          activeOpacity={0.85}
          accessibilityLabel="Active Shooter Alert Button"
          accessibilityHint="Double tap to arm, then confirm to broadcast an active shooter alert to all teams"
          accessibilityRole="button"
        >
          {/* Pulsing border ring when primed */}
          {isPrimed && <View style={styles.primedRing} />}

          <Text style={styles.warningIcon}>⚠</Text>
          <Text style={styles.label}>ACTIVE SHOOTER</Text>
          <Text style={styles.sublabel}>
            {isPrimed ? 'TAP AGAIN TO ARM' : 'DOUBLE TAP TO ACTIVATE'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Confirmation modal */}
      <Modal visible={confirmVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconRow}>
              <Text style={styles.modalIcon}>🚨</Text>
            </View>

            <Text style={styles.modalTitle}>ACTIVE SHOOTER ALERT</Text>
            <Text style={styles.modalBody}>
              This will immediately broadcast an{'\n'}
              <Text style={styles.modalEmphasis}>EMERGENCY alert to your entire organization</Text>
              {'\n'}with your GPS location. All teams will be notified and their phones will sound at
              full volume, overriding mute and Do Not Disturb.
            </Text>

            <Text style={styles.modalConfirmPrompt}>
              Only confirm if there is an active threat.
            </Text>

            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleConfirm}
              disabled={isSending}
              activeOpacity={0.8}
            >
              {isSending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>SEND ALERT NOW</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancel}
              disabled={isSending}
            >
              <Text style={styles.cancelBtnText}>Cancel — No Active Threat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#7F1D1D',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#991B1B',
    overflow: 'hidden',
    position: 'relative',
  },
  buttonPrimed: {
    backgroundColor: '#B91C1C',
    borderColor: '#EF4444',
    borderWidth: 2.5,
  },
  primedRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 3,
    borderColor: '#EF4444',
    opacity: 0.6,
  },
  warningIcon: {
    fontSize: 32,
    color: '#FCA5A5',
    marginBottom: 4,
  },
  label: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  sublabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FCA5A5',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: '#1C0A0A',
    borderRadius: BORDER_RADIUS.xl ?? BORDER_RADIUS.lg,
    padding: SPACING.xl ?? SPACING.lg,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1.5,
    borderColor: '#7F1D1D',
    alignItems: 'center',
    gap: SPACING.md,
  },
  modalIconRow: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#7F1D1D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalIcon: {
    fontSize: 32,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#EF4444',
    letterSpacing: 2,
    textAlign: 'center',
  },
  modalBody: {
    ...TYPOGRAPHY.body,
    color: '#D1D5DB',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalEmphasis: {
    color: '#FCA5A5',
    fontWeight: '700',
  },
  modalConfirmPrompt: {
    ...TYPOGRAPHY.caption,
    color: '#9CA3AF',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  confirmBtn: {
    width: '100%',
    backgroundColor: '#B91C1C',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EF4444',
    minHeight: 52,
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  cancelBtn: {
    width: '100%',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  cancelBtnText: {
    ...TYPOGRAPHY.body,
    color: '#9CA3AF',
  },
});
