/**
 * clientLogger — batched log forwarder to the server's /debug-log/batch endpoint.
 *
 * Captures iOS PTT framework delegate timing, Live Activity lifecycle, and
 * socket/LiveKit room events that can't be observed from server logs alone.
 * Lines arrive in Railway alongside the existing server logs prefixed with
 * [DiagPTT], so the full press-release-reconnect timeline can be reconstructed
 * without needing a Mac plugged in.
 *
 * Behaviour:
 *  - No-op when DEBUG_REMOTE_LOG is false.
 *  - Attaches a stable SESSION_ID (generated once per JS runtime) to every
 *    event so individual sessions can be retrieved from the server.
 *  - Merges any persistent context set via setClientContext() into the batch
 *    payload (device model, iOS version, etc.) — captured once at startup.
 *  - Buffers events and flushes in a single batch every 500 ms, or immediately
 *    when the queue hits 20 events. Use forceFlush() on critical transitions
 *    (channel join/leave, fatal errors) to ensure nothing is lost.
 *  - Failures are swallowed — debug logging must never break the app.
 */

import { apiClient } from '@/api/client';
import { generateUUIDv4 } from '@/utils/uuid';

// Master switch. Flip to false (or gate on __DEV__) to silence remote logging.
export const DEBUG_REMOTE_LOG = true;

// Stable for the lifetime of this JS runtime — used to correlate all events
// from a single app session on the server's GET /debug-log/session/:sessionId.
export const SESSION_ID = generateUUIDv4();

// Persistent device/build context merged into every batch payload.
// Call setClientContext() at startup to populate (e.g. from expo-device).
let persistentContext: Record<string, unknown> = {};

/**
 * Merge key-value pairs into every subsequent batch.
 * Call once at startup with device model, OS version, app version, etc.
 */
export function setClientContext(ctx: Record<string, unknown>): void {
  persistentContext = { ...persistentContext, ...ctx };
}

interface PendingEvent {
  tag: string;
  message: string;
  ts: number;
  sessionId: string;
  payload?: Record<string, unknown>;
}

const queue: PendingEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_LIMIT = 20;
const FLUSH_INTERVAL_MS = 500;

async function flush(): Promise<void> {
  flushTimer = null;
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await apiClient.post('/debug-log/batch', {
      events: batch,
      context: persistentContext,
    });
  } catch {
    // Best-effort. Don't retry — silent is the contract.
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flush().catch(() => null); }, FLUSH_INTERVAL_MS);
}

/**
 * Queue a debug event for delivery to the server.
 * tag — short grep-friendly category (e.g. "ptt:delegate:didJoin")
 * message — human-readable sentence
 * payload — any extra structured context
 */
export function clientLog(
  tag: string,
  message: string,
  payload?: Record<string, unknown>,
): void {
  if (!DEBUG_REMOTE_LOG) return;
  queue.push({ tag, message, ts: Date.now(), sessionId: SESSION_ID, payload });
  if (queue.length >= BATCH_LIMIT) {
    if (flushTimer) clearTimeout(flushTimer);
    flush().catch(() => null);
    return;
  }
  scheduleFlush();
}

/**
 * Force an immediate flush — call on critical transitions (join/leave, errors)
 * so in-flight events aren't lost if the socket reconnects before the timer fires.
 */
export function forceFlush(): void {
  if (!DEBUG_REMOTE_LOG) return;
  if (flushTimer) clearTimeout(flushTimer);
  flush().catch(() => null);
}
