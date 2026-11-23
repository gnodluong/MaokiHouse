import { requireSupabase } from '../lib/supabase/client';
import { apiUrl } from './apiBase';

export interface YouTubeOutcome { ok: boolean; error?: string; fetched?: number; added?: number; updated?: number; repliedAt?: string }

async function call(body: object): Promise<YouTubeOutcome> {
  const { data: { session } } = await requireSupabase().auth.getSession();
  if (!session) throw new Error('Vui lòng đăng nhập lại.');
  const response = await fetch(apiUrl('/api/youtube'), { method: 'POST', signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => null);
  if (!result) throw new Error(`API YouTube chưa hoạt động (HTTP ${response.status}). Kiểm tra máy chủ API và bản triển khai mới nhất.`);
  if (!response.ok) throw new Error(result.error || 'Không kết nối được YouTube.');
  return result;
}
export const syncYouTube = () => call({ action: 'sync' });
export const replyToYouTube = (recordId: string, text: string) => call({ action: 'reply', recordId, text });
