/**
 * Origin of the Maoki web API (/api/channels, /api/messaging, …).
 * In the browser it is the page's own origin (empty string). The desktop app has no server of its own,
 * so it takes the origin from Settings (localStorage) or the VITE_API_ORIGIN build variable.
 */
export const API_ORIGIN_KEY = 'maoki:api-origin';

export function apiOrigin(): string {
  let stored = '';
  try { stored = window.localStorage.getItem(API_ORIGIN_KEY) || ''; } catch { /* storage blocked */ }
  return (stored || (import.meta.env.VITE_API_ORIGIN as string | undefined) || '').replace(/\/+$/, '');
}

export const apiUrl = (path: string) => apiOrigin() + path;
