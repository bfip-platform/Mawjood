/**
 * Offline layer (D3 T-D3-4) — read cache + write outbox for the voice
 * engine. Storage-agnostic: the host injects a tiny async KV (AsyncStorage
 * on mobile, localStorage on web) so this module stays pure TypeScript
 * with no platform imports and is unit-testable with an in-memory KV.
 *
 * Design rules:
 *  - Reads: stale-while-revalidate. A cached list is returned instantly
 *    (marked with its age); the caller refreshes from the network and
 *    re-caches. When the network fails, the cache IS the answer.
 *  - Writes: an outbox with STABLE client-generated ids. A create is
 *    enqueued with the item's id already assigned, so replaying after a
 *    lost response is idempotent — the server insert collides on the PK
 *    and the engine's createItem resolves the conflict to the existing
 *    row (see client.ts createItem, T-D3-6). No duplicates, ever.
 *  - FIFO: the outbox flushes in order and stops at the first failure —
 *    later writes never overtake earlier ones.
 */

export interface KVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface CachedList<T> {
  rows: T[];
  cachedAt: string;
}

export interface OutboxOp {
  opId: string;
  kind: 'createItem';
  // The full createItem input, INCLUDING its stable item id.
  payload: Record<string, unknown>;
  queuedAt: string;
  attempts: number;
}

const LIST_PREFIX = 'offline:list:';
const OUTBOX_KEY = 'offline:outbox:v1';

function defaultId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class OfflineSync {
  private kv: KVStore;
  private newId: () => string;
  private now: () => Date;

  constructor(kv: KVStore, opts?: { newId?: () => string; now?: () => Date }) {
    this.kv = kv;
    this.newId = opts?.newId ?? defaultId;
    this.now = opts?.now ?? (() => new Date());
  }

  /** Generate a stable id for a new entity (used BEFORE enqueue/insert). */
  makeId(): string {
    return this.newId();
  }

  async cacheList<T>(key: string, rows: T[]): Promise<void> {
    const entry: CachedList<T> = { rows, cachedAt: this.now().toISOString() };
    await this.kv.set(LIST_PREFIX + key, JSON.stringify(entry));
  }

  async readList<T>(key: string): Promise<CachedList<T> | null> {
    const raw = await this.kv.get(LIST_PREFIX + key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as CachedList<T>;
      if (!Array.isArray(parsed.rows)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async loadOutbox(): Promise<OutboxOp[]> {
    const raw = await this.kv.get(OUTBOX_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as OutboxOp[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async saveOutbox(ops: OutboxOp[]): Promise<void> {
    await this.kv.set(OUTBOX_KEY, JSON.stringify(ops));
  }

  /** Enqueue a create. The payload MUST already carry its stable id. */
  async enqueueCreate(payload: Record<string, unknown>): Promise<OutboxOp> {
    const op: OutboxOp = {
      opId: this.newId(),
      kind: 'createItem',
      payload,
      queuedAt: this.now().toISOString(),
      attempts: 0,
    };
    const ops = await this.loadOutbox();
    ops.push(op);
    await this.saveOutbox(ops);
    return op;
  }

  async pending(): Promise<OutboxOp[]> {
    return this.loadOutbox();
  }

  /**
   * Flush the outbox FIFO through `send`. 'ok' (including an
   * idempotency-conflict resolution) removes the op; a throw or 'retry'
   * stops the flush, leaving the op (attempts+1) and everything behind
   * it queued, in order.
   */
  async flush(send: (op: OutboxOp) => Promise<'ok' | 'retry'>): Promise<{ sent: number; remaining: number }> {
    const ops = await this.loadOutbox();
    let sent = 0;
    while (ops.length > 0) {
      const op = ops[0];
      let result: 'ok' | 'retry';
      try {
        result = await send(op);
      } catch {
        result = 'retry';
      }
      if (result !== 'ok') {
        op.attempts += 1;
        await this.saveOutbox(ops);
        return { sent, remaining: ops.length };
      }
      ops.shift();
      sent += 1;
      await this.saveOutbox(ops);
    }
    return { sent, remaining: 0 };
  }
}
