/**
 * PTT Beep Sounds
 *
 * Plays a short audio tone when the user starts or stops transmitting.
 * Uses expo-av for sound playback + Vibration for haptic fallback.
 *
 * Replace the .wav files in src/assets/sounds/ with real tones for production.
 * The current files are silent placeholders — the vibration feedback works
 * immediately without them.
 */

import { Vibration, Platform } from 'react-native';
import { Audio } from 'expo-av';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const START_SOUND = require('@/assets/sounds/ptt_start.wav');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const STOP_SOUND = require('@/assets/sounds/ptt_stop.wav');

let startSound: Audio.Sound | null = null;
let stopSound: Audio.Sound | null = null;
let loaded = false;

async function loadSounds(): Promise<void> {
  if (loaded || Platform.OS === 'web') return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
    });
    const [s, e] = await Promise.all([
      Audio.Sound.createAsync(START_SOUND, { volume: 0.8 }),
      Audio.Sound.createAsync(STOP_SOUND, { volume: 0.6 }),
    ]);
    startSound = s.sound;
    stopSound = e.sound;
    loaded = true;
  } catch {
    // Sound loading failed — vibration fallback will still work
  }
}

// Pre-load sounds on module import
if (Platform.OS !== 'web') {
  loadSounds();
}

async function playSound(sound: Audio.Sound | null): Promise<void> {
  if (!sound) return;
  try {
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Ignore playback errors (e.g. audio focus lost)
  }
}

export const pttBeeps = {
  /** Play "transmit start" beep — indicates user can begin speaking */
  async onTransmitStart(): Promise<void> {
    Vibration.vibrate(40);
    await playSound(startSound);
  },

  /** Play "transmit stop" beep — indicates transmission ended */
  async onTransmitStop(): Promise<void> {
    Vibration.vibrate([0, 20, 20, 20]);
    await playSound(stopSound);
  },
};
