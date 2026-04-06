// Environment configuration
// In production, these come from app.config.js extra or EAS secrets

interface EnvConfig {
  apiUrl: string;
  socketUrl: string;
  livekitUrl: string;
  isDev: boolean;
}

const DEV_CONFIG: EnvConfig = {
  apiUrl: 'http://192.168.10.169:3001',
  socketUrl: 'ws://192.168.10.169:3001',
  livekitUrl: 'ws://192.168.10.169:7880',
  isDev: true,
};

const PROD_CONFIG: EnvConfig = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://api.guardiancomm.app',
  socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || 'wss://api.guardiancomm.app',
  livekitUrl: process.env.EXPO_PUBLIC_LIVEKIT_URL || 'wss://livekit.guardiancomm.app',
  isDev: false,
};

export const ENV: EnvConfig = __DEV__ ? DEV_CONFIG : PROD_CONFIG;
