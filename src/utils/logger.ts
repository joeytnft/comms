// Lightweight client-side logger — mirrors server pino interface
const isDev = __DEV__;

export const logger = {
  info: (msg: string) => { if (isDev) console.log('[INFO]', msg); },
  warn: (obj: Record<string, unknown>, msg: string) => { if (isDev) console.warn('[WARN]', msg, obj); },
  error: (obj: Record<string, unknown>, msg: string) => { if (isDev) console.error('[ERROR]', msg, obj); },
  debug: (msg: string) => { if (isDev) console.debug('[DEBUG]', msg); },
};
