// ─── Mailbox 📬 — the player's inbox ─────────────────────────────────────────
//
// mailbox_v1 store. The app's quiet narrator: every time something happened
// while you were away (or too fast to read a toast), a letter lands here.
//
// What the mailbox is FOR:
//   • Morning catch-up — a receipts log of penalties taken, collapses,
//     level-ups, badges and season rewards.
//   • Reward letters carry coins with them and must be "collected" by hand
//     (claim-keyed, so they can never be double-claimed).
//   • Unread badge on the HQ grid keeps the inbox honest.
//
// Everything is stored locally (AsyncStorage), newest first, hard-capped at
// 60 letters — gas free, no server.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { withLock, LOCK_KEYS } from './writeLock';

const MAILBOX_KEY = '@habit_planner_mailbox_v1';
const MAILBOX_MAX = 60;

export type MailKind =
  | 'reward'      // 🎁 contains a collectable coin reward
  | 'levelup'     // ⭐ level-up letters (+SP summary)
  | 'achievement' // 🏆 badges
  | 'penalty'     // 🌙 close-the-day receipts
  | 'collapse'    // 🏚️ habit collapsed warnings
  | 'season'      // 🗓️ season results
  | 'system';     // 📡 tips & housekeeping

export interface MailEntry {
  id: string;
  kind: MailKind;
  icon: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  /** Coins attached — shown with a "Collect" button until claimed. */
  coinReward?: number;
  rewardClaimed?: boolean;
  /** Idempotency key for the attached reward (rendered as `mail_<id>`). */
  rewardKey?: string;
}

export interface MailboxStore {
  version: 1;
  seeded: boolean;
  letters: MailEntry[];
}

const EMPTY: MailboxStore = { version: 1, seeded: false, letters: [] };

// ─── Live listener (HQ tile badge) ───────────────────────────────────────────

const listeners = new Set<() => void>();

export function subscribeMailbox(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch {}
  });
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export async function loadMailbox(): Promise<MailboxStore> {
  try {
    const raw = await AsyncStorage.getItem(MAILBOX_KEY);
    if (!raw) return seedWelcomeMail({ ...EMPTY });
    const parsed = JSON.parse(raw) as Partial<MailboxStore>;
    const store: MailboxStore = {
      version: 1,
      seeded: parsed.seeded ?? true,
      letters: Array.isArray(parsed.letters) ? parsed.letters.slice(0, MAILBOX_MAX) : [],
    };
    return store.seeded ? store : seedWelcomeMail(store, true);
  } catch {
    return { ...EMPTY };
  }
}

async function saveMailbox(store: MailboxStore): Promise<void> {
  try {
    await AsyncStorage.setItem(MAILBOX_KEY, JSON.stringify({
      version: 1,
      seeded: store.seeded,
      letters: store.letters.slice(0, MAILBOX_MAX),
    }));
  } catch {}
  notify();
}

/** First open: welcome kit so the inbox doesn't feel broken. */
async function seedWelcomeMail(store: MailboxStore, persist = false): Promise<MailboxStore> {
  const now = Date.now();
  const letters: MailEntry[] = [
    {
      id: `mail_welcome_${now}`,
      kind: 'system',
      icon: '📮',
      title: 'Welcome to your Mailbox!',
      body:
        'This is your game journal. Every level-up, badge, collapse, season ' +
        'reward and day-close receipt lands here as a letter — even ones that ' +
        'happened while a toast disappeared too fast. Reward letters carry ' +
        'coins: open them and tap Collect.',
      createdAt: now,
      read: false,
    },
    {
      id: `mail_tip_${now}`,
      kind: 'system',
      icon: '🛡️',
      title: 'Pro tip — defense before damage',
      body:
        'When you Close the Day, shields 🛡 → freezes ❄ absorb misses before ' +
        'HP and coins take damage. Keep a Stockpile Streak Shield 🛡 or ' +
        'Skip Pass 🎫 from the Shop for busy days.',
      createdAt: now - 1,
      read: false,
    },
  ];
  const seeded: MailboxStore = { version: 1, seeded: true, letters };
  try {
    await AsyncStorage.setItem(MAILBOX_KEY, JSON.stringify(seeded));
  } catch {}
  if (persist) notify();
  return seeded;
}

// ─── Writing letters ─────────────────────────────────────────────────────────

export interface AddMailInput {
  kind: MailKind;
  icon: string;
  title: string;
  body: string;
  coinReward?: number;
}

/** Appends a letter (newest first). Dedupes by title+body within 30 s.
 *  Serialized: many pipelines (collapse, close-day, level-up, seasons) write
 *  mail while the user reads/deletes — unlocked writes dropped letters. */
export async function addMail(input: AddMailInput): Promise<void> {
  try {
    await withLock(LOCK_KEYS.mailbox, async () => {
      const store = await loadMailbox();
      // Soft dedupe: the same receipt rewritten on a replay claim gets ignored.
      const now = Date.now();
      const dupe = store.letters.find(
        (l) => l.title === input.title && l.body === input.body && now - l.createdAt < 30_000
      );
      if (dupe) return;
      const entry: MailEntry = {
        id: `mail_${now}_${Math.random().toString(36).slice(2, 7)}`,
        kind: input.kind,
        icon: input.icon,
        title: input.title,
        body: input.body,
        createdAt: now,
        read: false,
      };
      if (input.coinReward && input.coinReward > 0) {
        entry.coinReward = Math.round(input.coinReward);
        entry.rewardKey = `mailreward_${entry.id}`;
      }
      await saveMailbox({ ...store, letters: [entry, ...store.letters].slice(0, MAILBOX_MAX) });
    });
  } catch {}
}

// ─── Reading & claiming ──────────────────────────────────────────────────────

export async function markRead(id: string): Promise<void> {
  await withLock(LOCK_KEYS.mailbox, async () => {
    const store = await loadMailbox();
    const next = store.letters.map((l) => (l.id === id && !l.read ? { ...l, read: true } : l));
    if (next.some((l, i) => l !== store.letters[i])) {
      await saveMailbox({ ...store, letters: next });
    }
  });
}

export async function markAllRead(): Promise<void> {
  await withLock(LOCK_KEYS.mailbox, async () => {
    const store = await loadMailbox();
    if (store.letters.some((l) => !l.read)) {
      await saveMailbox({ ...store, letters: store.letters.map((l) => ({ ...l, read: true })) });
    }
  });
}

export async function deleteMail(id: string): Promise<void> {
  await withLock(LOCK_KEYS.mailbox, async () => {
    const store = await loadMailbox();
    await saveMailbox({ ...store, letters: store.letters.filter((l) => l.id !== id) });
  });
}

export async function clearMailbox(): Promise<void> {
  await withLock(LOCK_KEYS.mailbox, async () => {
    await saveMailbox({ version: 1, seeded: true, letters: [] });
  });
}

export async function unreadCount(): Promise<number> {
  const store = await loadMailbox();
  return store.letters.filter((l) => !l.read).length;
}

/**
 * Collects the coin reward attached to a letter. Once-only guaranteed by the
 * claims store (`mailreward_<id>`); the economy service handles cap/sounds.
 * Returns the amount granted (0 when nothing left to claim).
 */
export async function claimMailReward(id: string): Promise<number> {
  const gave = await withLock(LOCK_KEYS.mailbox, async () => {
    const store = await loadMailbox();
    const letter = store.letters.find((l) => l.id === id);
    if (!letter || !letter.coinReward || letter.rewardClaimed) return 0;
    const [bus, economy] = await Promise.all([import('./gameBus'), import('./economyService')]);
    if (!(await bus.claimReward(letter.rewardKey ?? `mailreward_${id}`))) return 0;
    const granted = await economy.earnCoins(letter.coinReward, 'Mailbox reward 📬');
    if (!granted.ok) return 0;
    const fresh = await loadMailbox();
    await saveMailbox({
      ...fresh,
      letters: fresh.letters.map((l) => (l.id === id ? { ...l, rewardClaimed: true } : l)),
    });
    return letter.coinReward;
  });
  return gave;
}
