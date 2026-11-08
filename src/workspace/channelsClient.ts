import { requireSupabase } from '../lib/supabase/client';

export type CalendarPlatform = 'airbnb' | 'booking' | 'agoda' | 'vrbo' | 'expedia' | 'traveloka' | 'tripcom' | 'google' | 'ical';
export interface CalendarConnection { id: string; propertyId: string; platform: CalendarPlatform; label: string; exportToken: string; lastSyncedAt: string | null; lastError: string; blockCount: number }
export interface SyncResult { synced?: boolean; saved?: boolean; disconnected?: boolean; id?: string; error?: string; blockCount?: number; conflictCount?: number }

export async function channelRequest<T>(body?: unknown): Promise<T> {
  const { data: { session } } = await requireSupabase().auth.getSession();
  if (!session) throw new Error('Vui lòng đăng nhập lại.');
  const response = await fetch('/api/channels', { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(45000), headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || `Dịch vụ kết nối chưa hoạt động (HTTP ${response.status}). Kiểm tra bản triển khai mới nhất.`);
  return result as T;
}

export const STALE_AFTER_MS = 60 * 60 * 1000;
export const isStale = (connection: CalendarConnection, now = Date.now()) => !connection.lastSyncedAt || now - Date.parse(connection.lastSyncedAt) > STALE_AFTER_MS;

/** Sync connections one at a time (the server budgets syncs per minute). Returns how many succeeded. */
export async function syncConnections(connections: CalendarConnection[], onProgress?: (done: number, total: number) => void): Promise<{ ok: number; failed: number }> {
  let ok = 0; let failed = 0;
  for (const [index, connection] of connections.entries()) {
    try { const result = await channelRequest<SyncResult>({ action: 'sync', id: connection.id }); if (result.synced) ok++; else failed++; }
    catch { failed++; }
    onProgress?.(index + 1, connections.length);
  }
  return { ok, failed };
}
