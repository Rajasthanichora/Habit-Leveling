import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { HabitProvider } from '../contexts/HabitContext';
import {
  initNotifications,
  rebuildAllSchedules,
  handleNotificationResponse,
  refreshDynamicAlerts,
} from '../services/notificationService';
import { initAudio, preloadCommonSounds } from '../services/soundService';
import { runLegacyCleanup } from '../services/cleanupService';
import { LevelUpOverlay } from '../components/feature/LevelUpOverlay';
import { PenaltyFlash } from '../components/feature/PenaltyFlash';

/**
 * Cold-start boot: audio first (sounds need it), then the
 * notification engine (channels + categories + permissions). The heavy
 * follow-ups — the FULL schedule resync and sound preloading — are deferred
 * until the first interaction settles: they used to block the JS thread
 * during launch, delaying the first habit-list frame. Order is unchanged,
 * only timing, and the cancel guard keeps a closed app from scheduling.
 */
function AlarmInit() {
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      if (cancelled) return;
      try {
        await initAudio();
        preloadCommonSounds();
        await initNotifications();
      } catch {}
      // Full resync is the expensive part — run it after the first frame is
      // painted so launch stays responsive (rAF chain + macrotask = post-paint).
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const rafId = requestAnimationFrame(() => {
        timeoutId = setTimeout(() => {
          if (!cancelled) void rebuildAllSchedules();
        }, 0);
      });
      return () => {
        cancelAnimationFrame(rafId);
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      };
    };
    let teardown: (() => void) | undefined;
    void boot().then((t) => { teardown = t; });
    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);
  return null;
}

/** One-shot purge of removed feature leftovers (theme prefs, AI keys). */
function LegacyCleanup() {
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    // Deferred past the first paint so boot isn't blocked by storage I/O.
    const rafId = requestAnimationFrame(() => {
      timeoutId = setTimeout(() => {
        void runLegacyCleanup();
      }, 0);
    });
    return () => {
      cancelAnimationFrame(rafId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);
  return null;
}

/**
 * Bridges system-notification responses into the app: action buttons are
 * handled by the notification service; a plain tap opens the Today tab.
 * Also replays the last response when the app was cold-started by a tap.
 */
function NotificationBridge() {
  const router = useRouter();

  useEffect(() => {
    const openToday = () => {
      try {
        router.push('/(tabs)');
      } catch {}
    };

    const process = async (response: Notifications.NotificationResponse) => {
      const result = await handleNotificationResponse(response);
      if (result.shouldNavigate) openToday();
    };

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      process(response);
    });

    // App was launched *by* the notification (killed state): the live
    // listener just attached and misses it, so run the stored last response.
    Notifications.getLastNotificationResponseAsync()
      .then((last) => {
        if (last) process(last);
      })
      .catch(() => {});

    return () => subscription.remove();
  }, [router]);

  // Every time the user brings the app to foreground, refresh the dynamic
  // notification bodies (digest / guard / brief / nudge) and the badge so
  // the next pushes always reflect the latest progress. Throttled inside
  // refreshDynamicAlerts.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshDynamicAlerts();
      }
    });
    return () => subscription.remove();
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HabitProvider>
        <LevelUpOverlay />
        <PenaltyFlash />
        <LegacyCleanup />
        <AlarmInit />
        <NotificationBridge />
        <Stack screenOptions={{ headerShown: false }} />
      </HabitProvider>
    </GestureHandlerRootView>
  );
}
