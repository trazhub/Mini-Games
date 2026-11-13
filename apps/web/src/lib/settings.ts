import { useSyncExternalStore } from 'react';
import { loadSettings, saveSettings, type Settings } from './storage';

let current: Settings = loadSettings();
const listeners = new Set<() => void>();

function apply(s: Settings): void {
  document.documentElement.classList.toggle('reduce-motion', s.reducedMotion);
}
apply(current);

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  saveSettings(current);
  apply(current);
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

/** True when either the app setting or the OS preference asks for reduced motion. */
export function prefersReducedMotion(s: Settings = current): boolean {
  return s.reducedMotion || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
