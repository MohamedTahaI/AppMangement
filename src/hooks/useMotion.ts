import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

import { getSetting, subscribeToSettingChange } from '@/db/settings';
import { theme } from '@/theme';

export interface MotionSettings {
  enabled: boolean;
  durations: {
    fast: number;
    normal: number;
    slow: number;
    stagger: number;
  };
  spring: {
    duration: number;
    dampingRatio: number;
  };
}

let motionEnabled = false;
let systemReducedMotion = false;
let appReducedMotion = false;
let initialization: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publishMotion(): void {
  const next = !systemReducedMotion && !appReducedMotion;
  if (next === motionEnabled) return;
  motionEnabled = next;
  listeners.forEach((listener) => listener());
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

function initializeMotionState(): Promise<void> {
  if (initialization) return initialization;

  initialization = (async () => {
    const [systemReduced, setting] = await Promise.all([
      AccessibilityInfo.isReduceMotionEnabled(),
      getSetting('reduce_motion'),
    ]);
    systemReducedMotion = systemReduced;
    appReducedMotion = setting === '1';
    publishMotion();

    AccessibilityInfo.addEventListener('reduceMotionChanged', (reduced) => {
      systemReducedMotion = reduced;
      publishMotion();
    });
    subscribeToSettingChange('reduce_motion', () => {
      void getSetting('reduce_motion')
        .then((value) => {
          appReducedMotion = value === '1';
          publishMotion();
        })
        .catch((error: unknown) => {
          console.error('تعذر قراءة إعداد تقليل الحركة.', error);
        });
    });
  })().catch((error: unknown) => {
    initialization = null;
    console.error('تعذر قراءة إعداد تقليل الحركة.', error);
  });
  return initialization;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return motionEnabled;
}

export function useMotion(): MotionSettings {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void initializeMotionState().then(notifyListeners);
  }, []);

  return useMemo(() => ({
    enabled,
    durations: enabled
      ? {
          fast: theme.motion.fast,
          normal: theme.motion.normal,
          slow: theme.motion.slow,
          stagger: theme.motion.stagger,
        }
      : { fast: 0, normal: 0, slow: 0, stagger: 0 },
    spring: enabled
      ? theme.motion.pressSpring
      : { duration: 0, dampingRatio: 1 },
  }), [enabled]);
}
