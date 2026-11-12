// Powered by OnSpace.AI

/**
 * Tiny event bus so notification-side actions (tapping "Done" on a system
 * notification) can tell the React layer that completions changed. The
 * notification pipeline lives outside the React tree, so this is the only
 * bridge it needs — HabitContext subscribes with `onCompletionsChanged`.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyCompletionsChanged(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch {}
  });
}

/** Subscribe to completion changes; returns an unsubscribe function. */
export function onCompletionsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
