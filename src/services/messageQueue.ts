/**
 * Offline Message Queue
 *
 * When a message send fails (e.g. no network), the encrypted payload is stored
 * in MMKV and retried the next time the socket reconnects or the app regains
 * connectivity.  Only encrypted content is queued — plaintext is never stored.
 */

import { mmkvStorage } from '@/utils/mmkv';

const QUEUE_KEY = 'guardian_message_queue';

interface QueuedMessage {
  id: string; // matches the optimistic tempId in useChatStore
  groupId: string;
  encryptedContent: string;
  iv: string;
  queuedAt: number; // Unix ms
}

function readQueue(): QueuedMessage[] {
  try {
    const raw = mmkvStorage.getString(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMessage[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedMessage[]): void {
  mmkvStorage.setString(QUEUE_KEY, JSON.stringify(queue));
}

export const messageQueue = {
  enqueue(msg: QueuedMessage): void {
    const queue = readQueue();
    // Avoid duplicates
    if (queue.some((m) => m.id === msg.id)) return;
    queue.push(msg);
    writeQueue(queue);
  },

  dequeue(id: string): void {
    const queue = readQueue().filter((m) => m.id !== id);
    writeQueue(queue);
  },

  getAll(): QueuedMessage[] {
    // Discard messages older than 24 hours to prevent stale content
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const fresh = readQueue().filter((m) => m.queuedAt > cutoff);
    writeQueue(fresh);
    return fresh;
  },

  clear(): void {
    mmkvStorage.delete(QUEUE_KEY);
  },
};

export type { QueuedMessage };
