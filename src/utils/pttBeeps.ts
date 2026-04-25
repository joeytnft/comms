import { Vibration, Platform } from 'react-native';
import { Audio } from 'expo-av';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const START_SOUND = require('@/assets/sounds/ptt_start.wav');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const STOP_SOUND = require('@/assets/sounds/ptt_stop.wav');

let startSound: Audio.Sound | null = null;
let stopSound: Audio.Sound | null = null;
let loaded = false;

async function loadSounds(): Promise<void> {
  if (loaded || Platform.OS === 'web') return;
  try {
    // allowsRecordingIOS: true keeps expo-av in PlayAndRecord category,
    // which is compatible with LiveKit's audio session. Without it expo-av
    // tries to switch to Playback category, conflicts with LiveKit, and
    // playAsync() silently fails while the session is active.
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: true,
    });
    const [s, e] = await Promise.all([
      Audio.Sound.createAsync(START_SOUND, { volume: 0.8 }),
      Audio.Sound.createAsync(STOP_SOUND, { volume: 0.6 }),
    ]);
    startSound = s.sound;
    stopSound = e.sound;
    loaded = true;
  } catch {
    // Sound loading failed — vibration fallback still works
  }
}

if (Platform.OS !== 'web') {
  loadSounds();
}

async function playSound(sound: Audio.Sound | null): Promise<void> {
  if (!sound) return;
  try {
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Ignore — audio focus may be held by PTT recording
  }
}

export const pttBeeps = {
  async onTransmitStart(): Promise<void> {
    Vibration.vibrate(40);
    await playSound(startSound);
  },

  async onTransmitStop(): Promise<void> {
    Vibration.vibrate([0, 20, 20, 20]);
    await playSound(stopSound);
  },
};
