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
/** `apply` is true only in the admin shell and login page; other consumers just read or change the choice. */
export function useAdminTheme(apply = false) {
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
    if (!apply) return;
    const root = document.documentElement;
    root.dataset.mkTheme = resolved;
    const color = document.getElementById('theme-color');
    const previous = color?.getAttribute('content');
    color?.setAttribute('content', resolved === 'dark' ? '#141210' : '#f6f5f2');
    return () => { delete root.dataset.mkTheme; if (previous) color?.setAttribute('content', previous); };
  }, [resolved, apply]);

  // “Add to Home Screen” from any admin page installs the admin app (opens on the dashboard, no browser bar).
  useEffect(() => {
    if (!apply) return;
    const manifest = document.getElementById('app-manifest');
    const title = document.getElementById('app-title');
    manifest?.setAttribute('href', '/admin.webmanifest');
    title?.setAttribute('content', 'Maoki Admin');
    return () => { manifest?.setAttribute('href', '/manifest.webmanifest'); title?.setAttribute('content', 'MaokiHouse'); };
  }, [apply]);

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
