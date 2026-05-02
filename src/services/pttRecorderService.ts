/**
 * pttRecorderService — local audio recording during PTT transmission.
 *
 * Records via expo-av while the mic is live in LiveKit, then uploads
 * the file to the server after the transmission ends. The server saves
 * it to Supabase storage and returns a public URL that is attached to
 * the ptt:native_log socket event.
 *
 * Audio session notes:
 *  - LiveKit's AudioSession is already in PlayAndRecord mode when recording starts.
 *  - We do NOT call Audio.setAudioModeAsync to avoid disrupting LiveKit's session.
 *  - Recording fails silently — PTT still works; the log entry just has no audio.
 */

import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { secureStorage } from '@/utils/secureStorage';
import { ACCESS_TOKEN_KEY } from '@/config/constants';
import { ENV } from '@/config/env';

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

let activeRecording: Audio.Recording | null = null;

export const pttRecorderService = {
  /** Start local recording. Silent no-op on web or if already recording. */
  async start(): Promise<void> {
    if (Platform.OS === 'web' || activeRecording) return;
    try {
      const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
      activeRecording = recording;
    } catch (err) {
      console.warn('[PTTRecorder] Failed to start recording:', err);
      activeRecording = null;
    }
  },

  /**
   * Stop recording, upload to server, return the public audioUrl.
   * Returns null if recording never started or the upload fails —
   * callers should still send ptt:native_log, just without an audioUrl.
   */
  async stopAndUpload(groupId: string): Promise<string | null> {
    if (!activeRecording) return null;
    const recording = activeRecording;
    activeRecording = null;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) return null;

      const formData = new FormData();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formData.append('audio', { uri, type: 'audio/mp4', name: `ptt_${Date.now()}.m4a` } as any);

      // Use apiClient (not bare fetch) so the 401→refresh→retry interceptor fires
      // when the access token expires during a long PTT session. Raw fetch with a
      // manually-read token would silently fail after 15 minutes of inactivity.
      // Do NOT set Content-Type manually — axios must set it with the multipart boundary.
      // Overriding it here strips the boundary and Fastify returns 406.
      const res = await apiClient.post<{ audioUrl?: string }>(
        `/ptt/${groupId}/audio`,
        formData,
      );

      return res.data.audioUrl ?? null;
    } catch (err) {
      console.warn('[PTTRecorder] Upload failed:', err);
      return null;
    }
  },

  /** Discard any active recording without uploading (e.g. on channel leave). */
  cancel(): void {
    if (!activeRecording) return;
    const recording = activeRecording;
    activeRecording = null;
    recording.stopAndUnloadAsync().catch(() => null);
  },
};
