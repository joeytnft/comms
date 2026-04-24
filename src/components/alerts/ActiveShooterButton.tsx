import React, { useRef, useState, useCallback, useEffect } from 'react';
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
  PanResponder,
  LayoutChangeEvent,
} from 'react-native';
import * as Location from 'expo-location';
import { useAlertStore } from '@/store/useAlertStore';
import { SPACING, BORDER_RADIUS, TYPOGRAPHY } from '@/config/theme';

const PRIME_TIMEOUT_MS = 3000;
const THUMB_SIZE = 56;
const SWIPE_PADDING = 4;
// User must drag at least 85% of the track before release triggers confirm
const SWIPE_THRESHOLD = 0.85;

type ButtonState = 'idle' | 'primed';

// ─── Swipe-to-confirm bar ─────────────────────────────────────────────────────

interface SwipeToConfirmProps {
  onConfirm: () => void;
  disabled: boolean;
  active: boolean; // resets the bar each time the modal opens
}

function SwipeToConfirm({ onConfirm, disabled, active }: SwipeToConfirmProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const confirmedRef = useRef(false);
  const disabledRef = useRef(disabled);
  const onConfirmRef = useRef(onConfirm);
  const dragX = useRef(new Animated.Value(0)).current;

  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { onConfirmRef.current = onConfirm; }, [onConfirm]);

  // Reset every time the modal opens
  useEffect(() => {
    if (!active) return;
    confirmedRef.current = false;
    dragX.setValue(0);
  }, [active, dragX]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current && trackWidthRef.current > 0,
      onMoveShouldSetPanResponder: (_e, { dx }) => !disabledRef.current && dx > 5,
      onPanResponderMove: (_e, { dx }) => {
        if (confirmedRef.current || disabledRef.current) return;
        const maxDrag = trackWidthRef.current - THUMB_SIZE - SWIPE_PADDING * 2;
        const clamped = Math.max(0, Math.min(dx, maxDrag));
        dragX.setValue(clamped);

        if (maxDrag > 0 && clamped >= maxDrag * SWIPE_THRESHOLD) {
          confirmedRef.current = true;
          Vibration.vibrate(Platform.OS === 'android' ? [0, 100, 60, 100] : [80]);
          Animated.timing(dragX, {
            toValue: maxDrag,
            duration: 80,
            useNativeDriver: false,
          }).start(() => onConfirmRef.current());
        }
      },
      onPanResponderRelease: () => {
        if (!confirmedRef.current) {
          Animated.spring(dragX, {
            toValue: 0,
            useNativeDriver: false,
            friction: 6,
            tension: 80,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        if (!confirmedRef.current) {
          Animated.spring(dragX, {
            toValue: 0,
            useNativeDriver: false,
            friction: 6,
            tension: 80,
          }).start();
        }
      },
    }),
  ).current;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    trackWidthRef.current = w;
    setTrackWidth(w);
  }, []);

  const maxDrag = Math.max(0, trackWidth - THUMB_SIZE - SWIPE_PADDING * 2);
  const fillWidth =
    trackWidth > 0
      ? dragX.interpolate({
          inputRange: [0, maxDrag || 1],
          outputRange: [THUMB_SIZE + SWIPE_PADDING * 2, trackWidth],
          extrapolate: 'clamp',
        })
      : THUMB_SIZE + SWIPE_PADDING * 2;

  return (
    <View
      style={swipeStyles.track}
      onLayout={handleLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Slide to confirm alert"
      accessibilityHint="Slide from left to right to send the active shooter alert"
    >
      {/* Growing red fill behind the label */}
      <Animated.View style={[swipeStyles.fill, { width: fillWidth }]} />

      {/* Centered label — stays visible above the fill */}
      <Text style={swipeStyles.label} numberOfLines={1}>
        {disabled ? 'SENDING…' : 'SLIDE TO CONFIRM →'}
      </Text>

      {/* Draggable thumb */}
      {trackWidth > 0 && (
        <Animated.View
          style={[swipeStyles.thumb, { transform: [{ translateX: dragX }] }]}
          {...panResponder.panHandlers}
        >
          {disabled ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={swipeStyles.thumbArrow}>▶▶</Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  track: {
    width: '100%',
    height: THUMB_SIZE + SWIPE_PADDING * 2,
    borderRadius: (THUMB_SIZE + SWIPE_PADDING * 2) / 2,
    backgroundColor: '#3B0000',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#7F1D1D',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#7F1D1D',
    borderRadius: (THUMB_SIZE + SWIPE_PADDING * 2) / 2,
    right: undefined, // override absoluteFillObject right so width controls it
  },
  label: {
    position: 'absolute',
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.5,
    textAlign: 'center',
    pointerEvents: 'none',
  },
  thumb: {
    position: 'absolute',
    left: SWIPE_PADDING,
    top: SWIPE_PADDING,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 2,
  },
  thumbArrow: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
});

// ─── Main button ──────────────────────────────────────────────────────────────

export function ActiveShooterButton() {
  const { triggerAlert } = useAlertStore();

  const [buttonState, setButtonState] = useState<ButtonState>('idle');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [isSending, setIsSending] = useState(false);

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
      Vibration.vibrate(Platform.OS === 'android' ? [0, 80] : 80);
      setButtonState('primed');
      startPulse();
      primeTimer.current = setTimeout(resetToIdle, PRIME_TIMEOUT_MS);
    } else {
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
          accessibilityHint="Double tap to arm, then slide to confirm and broadcast an active shooter alert to all teams"
          accessibilityRole="button"
        >
          {isPrimed && <View style={styles.primedRing} />}
          <Text style={styles.warningIcon}>⚠</Text>
          <Text style={styles.label}>ACTIVE SHOOTER</Text>
          <Text style={styles.sublabel}>
            {isPrimed ? 'TAP AGAIN TO ARM' : 'DOUBLE TAP TO ACTIVATE'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

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

            <SwipeToConfirm
              onConfirm={handleConfirm}
              disabled={isSending}
              active={confirmVisible}
            />

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
