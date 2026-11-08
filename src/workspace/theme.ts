import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'maoki:admin-theme';

function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * Admin colour theme. The resolved value is written to <html data-mk-theme>, so
 * dialogs rendered in portals outside the shell use the same tokens.
 */
export function useAdminTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => (preference === 'system' ? (systemDark() ? 'dark' : 'light') : preference));

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setResolved(preference === 'system' ? (media.matches ? 'dark' : 'light') : preference);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.mkTheme = resolved;
    return () => { delete root.dataset.mkTheme; };
  }, [resolved]);

  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    try { window.localStorage.setItem(KEY, value); } catch { /* private mode: keeps the choice for this visit */ }
    window.dispatchEvent(new CustomEvent('maoki:theme', { detail: value }));
  }, []);

  // Keep several mounted consumers (topbar toggle, Settings) in step.
  useEffect(() => {
    const sync = (event: Event) => setPreferenceState((event as CustomEvent<ThemePreference>).detail);
    window.addEventListener('maoki:theme', sync);
    return () => window.removeEventListener('maoki:theme', sync);
  }, []);

  return { preference, resolved, setPreference };
}
