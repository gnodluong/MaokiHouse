import { apiFetch } from '../services/api';
import { databaseError, requireSupabase } from '../lib/supabase/client';

export const publicPath = (path: string, demo: boolean) => path + (demo ? '?demo=1' : '');
export async function publicFetch<T>(path: string, options?: { method?: 'POST'; body?: unknown }): Promise<T> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === '1') return apiFetch<T>(path, options);
  const [pathname, query] = path.split('?'); const parts = pathname.split('/').filter(Boolean); const params = Object.fromEntries(new URLSearchParams(query));
  const op = parts[1] === 'properties' ? !parts[2] ? 'list' : parts[3] === 'quote' ? 'quote' : parts[3] === 'book' ? 'book' : 'property' : parts[1] === 'guidebooks' ? 'guide' : options?.method === 'POST' ? 'chat' : 'widget';
  const { data, error } = await requireSupabase().rpc('maoki_public', { op, record_id: parts[1] === 'properties' ? parts[2] || null : null, token: parts[1] === 'properties' ? '' : parts[2], payload: options?.body || params });
  if (error) throw ['PGRST202','PGRST205'].includes(error.code) ? new Error('Thông tin lưu trú đang được cập nhật. Vui lòng quay lại sau.') : databaseError(error); return data as T;
}
