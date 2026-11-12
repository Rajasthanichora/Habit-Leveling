// ─── Per-key async write lock ─────────────────────────────────────────────────
//
// Every AsyncStorage-backed game store (completions, economy, claims, XP,
// penalty) is a read-modify-write over the whole file. Two pipelines that
// interleave (a habit tap while a notification "Done ✓" lands, two fast taps,
// a purchase while coins are earned) read the same snapshot and write back
// stale arrays — completions vanish, coins are lost, claims double-pay.
//
// `withLock(key, fn)` serializes every critical section for a storage key so
// the read-merge-write always runs against the latest on-disk state. Locks are
// FIFO and never reject on their own (fn's errors propagate, the lock releases).

const queues = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  // Chain behind whatever is running — a previous rejection must not stall us.
  const run = prev.catch(() => undefined).then(fn);
  // Keep the queue alive even if fn rejects; drop the tail once settled so the
  // map doesn't grow forever.
  const tail = run.catch(() => undefined);
  queues.set(key, tail);
  try {
    return await run;
  } finally {
    if (queues.get(key) === tail) queues.delete(key);
  }
}

/** Shared keys so every service locks the same file the same way. */
export const LOCK_KEYS = {
  completions: 'completions',
  economy: 'economy',
  claims: 'claims',
  xp: 'xp',
  penalty: 'penalty',
  skills: 'skills',
  hp: 'hp',
  mailbox: 'mailbox',

  challenge: 'challenge',
  prestige: 'prestige',
  habits: 'habits',
} as const;
