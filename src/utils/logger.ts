// Lightweight client-side logger — mirrors server pino interface
const isDev = __DEV__;

export const logger = {
  info: (msg: string) => { if (isDev) console.log('[INFO]', msg); },
  warn: (obj: Record<string, unknown>, msg: string) => { if (isDev) console.warn('[WARN]', msg, obj); },
  error: (obj: Record<string, unknown>, msg: string) => { if (isDev) console.error('[ERROR]', msg, obj); },
  debug: (msg: string) => { if (isDev) console.debug('[DEBUG]', msg); },
};

/**
 * Structured crash report entry point. Anywhere we used to silently swallow an
 * error (`.catch(() => null)`) should now route through here with context, so
 * the dev console at least shows what failed and why. When Sentry / Bugsnag
 * is wired up, that integration goes in this single place — call sites do
 * not change.
 */
export interface CrashReportPayload {
  err: unknown;
  context: string;                       // short identifier of the call site
  extra?: Record<string, unknown>;       // anything useful to repro
  fatal?: boolean;                       // true → ErrorBoundary or unhandled
}

export function reportCrash(payload: CrashReportPayload): void {
  const { err, context, extra, fatal } = payload;
  const errMsg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  // Always log to console — even in production builds — so devs picking
  // up a device for triage have something to grep for.
  console.error('[Crash]', {
    context,
    fatal: !!fatal,
    error: errMsg,
    stack,
    ...(extra ?? {}),
  });
  // TODO: hand off to Sentry / Bugsnag here when configured. Keep this
  // function as the single integration point.
}
