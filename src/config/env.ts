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
const DEV_HOST = Platform.OS === 'web' ? 'localhost' : '10.0.0.48';

const DEV_CONFIG: EnvConfig = {
  apiUrl: 'https://api.gathersafeapp.com',
  socketUrl: 'wss://api.gathersafeapp.com',
  livekitUrl: `ws://${DEV_HOST}:7880`,
  isDev: true,
};

const PROD_CONFIG: EnvConfig = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://api.gathersafeapp.com',
  socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || 'wss://api.gathersafeapp.com',
  livekitUrl: process.env.EXPO_PUBLIC_LIVEKIT_URL || 'wss://livekit.gathersafeapp.com',
  isDev: false,
};

export const ENV: EnvConfig = __DEV__ ? DEV_CONFIG : PROD_CONFIG;
