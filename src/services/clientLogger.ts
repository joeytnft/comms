/**
 * clientLogger — fire-and-forget log forwarder to the server's /debug-log
 * endpoint.
 *
 * Used to capture iOS PTT framework delegate timing (which can't be observed
 * from server logs alone) without requiring a Mac plugged into the device.
 * Lines arrive in Railway alongside the existing server logs prefixed with
 * [ClientPTT], so the press-release-press timing can be reconstructed.
 *
 * Behaviour:
 *  - No-op when DEBUG_REMOTE_LOG is false.
 *  - Buffers events and flushes in batches every ~500ms (or when 20 events
 *    have queued up, whichever comes first) so a tight burst of native
 *    callbacks doesn't fan out 20 individual HTTP requests.
 *  - apiClient.post is used so the 401-refresh interceptor catches expired
 *    tokens during long debug sessions.
 *  - Failures are swallowed — debug logging must never break the app it's
 *    diagnosing.
 */

import { apiClient } from '@/api/client';

// Master switch. Flip to false (or thread through ENV) to silence remote
// logging in production builds where you don't want the HTTP traffic.
export const DEBUG_REMOTE_LOG = true;

interface PendingEvent {
  tag: string;
  message: string;
  ts: number;
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
  // Server endpoint is one-event-per-call. Send sequentially so order is
  // preserved in the server log; debug logging is rare enough that the
  // serialisation cost doesn't matter.
  for (const event of batch) {
    try {
      await apiClient.post('/debug-log', event);
    } catch {
      // Best-effort. Don't retry, don't log — silent is the contract.
    }
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flush().catch(() => null); }, FLUSH_INTERVAL_MS);
}

/**
 * Queue a debug event for delivery to the server. tag is a short
 * grep-friendly category (e.g. "ptt:delegate:didJoin"); message is a human
 * sentence; payload is any extra structured context.
 */
export function clientLog(
  tag: string,
  message: string,
  payload?: Record<string, unknown>,
): void {
  if (!DEBUG_REMOTE_LOG) return;
  queue.push({ tag, message, ts: Date.now(), payload });
  if (queue.length >= BATCH_LIMIT) {
    if (flushTimer) clearTimeout(flushTimer);
    flush().catch(() => null);
    return;
  }
  scheduleFlush();
}
