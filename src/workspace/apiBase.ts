import publicConfig from '../config/supabase.public';

/**
 * Where the Maoki API (messaging, reviews, YouTube, channels, inbound webhooks, worker) lives.
 * By default it is the Supabase Edge Function `api` of the connected project:
 *   https://<project>.supabase.co/functions/v1/api/<endpoint>
 * An advanced override (Settings, or VITE_API_ORIGIN) points at a self-hosted server that serves /api/<endpoint> instead.
 */
export const API_ORIGIN_KEY = 'maoki:api-origin';

export function apiOrigin(): string {
  let stored = '';
  try { stored = window.localStorage.getItem(API_ORIGIN_KEY) || ''; } catch { /* storage blocked */ }
  return (stored || (import.meta.env.VITE_API_ORIGIN as string | undefined) || '').replace(/\/+$/, '');
}

const supabaseUrl = () => String(import.meta.env.VITE_SUPABASE_URL || publicConfig.url || '').replace(/\/+$/, '');

/** `path` is the endpoint path, e.g. `/api/messaging`. */
export function apiUrl(path: string): string {
  const origin = apiOrigin();
  return origin ? origin + path : `${supabaseUrl()}/functions/v1/api/${path.replace(/^\/api\//, '')}`;
}
