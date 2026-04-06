// Web stub for expo-audio — audio recording is handled via MediaRecorder on web
export function useAudioRecorder() {
  return {
    record: async () => {},
    stop: async () => {},
  };
}

export const AudioModule = {
  requestRecordingPermissionsAsync: async () => ({ granted: true }),
  setAudioModeAsync: async (_options: unknown) => {},
};

export const RecordingPresets = {
  LOW_QUALITY: {},
};
