import { useEffect } from 'react';
import { AppState } from 'react-native';

import { idleFor, useSessionStore } from './sessionStore';

/**
 * Locks the app after `autoLockMinutes` of inactivity, and immediately when the
 * app comes back from the background after that window. Activity is recorded on
 * navigation, foregrounding and (implicitly) the idle timer itself; typing in a
 * form without navigating for the full window is the documented edge case.
 */
export function useAutoLock(enabled = true): void {
  const status = useSessionStore((state) => state.status);
  const autoLockMinutes = useSessionStore((state) => state.autoLockMinutes);
  const lock = useSessionStore((state) => state.lock);

  useEffect(() => {
    if (!enabled || status !== 'unlocked') return;
    const { markBackgrounded, touch } = useSessionStore.getState();

    const threshold = autoLockMinutes * 60_000;

    const interval = setInterval(() => {
      const state = useSessionStore.getState();
      if (idleFor(state, Date.now()) >= threshold) lock();
    }, 5000);

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        markBackgrounded();
        return;
      }
      if (next === 'active') {
        const state = useSessionStore.getState();
        if (state.backgroundedAt !== null) {
          const awayMs = Date.now() - state.backgroundedAt;
          if (awayMs >= threshold) {
            lock();
            return;
          }
        }
        touch();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [enabled, status, autoLockMinutes, lock]);
}