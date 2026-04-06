// Environment configuration
// In production, these come from app.config.js extra or EAS secrets

import { Platform } from 'react-native';

interface EnvConfig {
  apiUrl: string;
  socketUrl: string;
  livekitUrl: string;
  isDev: boolean;
}

// Web browser runs on the same machine as the server → use localhost.
// Native devices (iOS/Android) on the LAN need the Windows host IP.
const DEV_HOST = Platform.OS === 'web' ? 'localhost' : '192.168.10.169';

const DEV_CONFIG: EnvConfig = {
  apiUrl: `http://${DEV_HOST}:3001`,
  socketUrl: `ws://${DEV_HOST}:3001`,
  livekitUrl: `ws://${DEV_HOST}:7880`,
  isDev: true,
};

const PROD_CONFIG: EnvConfig = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://api.guardiancomm.app',
  socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || 'wss://api.guardiancomm.app',
  livekitUrl: process.env.EXPO_PUBLIC_LIVEKIT_URL || 'wss://livekit.guardiancomm.app',
  isDev: false,
};

export const ENV: EnvConfig = __DEV__ ? DEV_CONFIG : PROD_CONFIG;
