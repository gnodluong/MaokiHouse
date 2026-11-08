import { requireSupabase } from '../lib/supabase/client';

export const DEFAULT_AI_MODEL = 'nvidia/nemotron-3.5-super-vl:free';
export interface AIStatus { configured: boolean; provider: 'OpenRouter' | 'Gemini'; model: string; source: 'workspace' | 'server' | null; keyHint: string; allowAgents: boolean; canManage: boolean; canUse: boolean; updatedAt: string | null; needsUpgrade?: boolean }

export async function aiRequest<T = Record<string, unknown>>(method: 'GET' | 'POST', signal: AbortSignal, body?: unknown): Promise<T> {
  const { data: { session } } = await requireSupabase().auth.getSession();
  if (!session) throw new Error('Vui lòng đăng nhập lại.');
  const response = await fetch('/api/assistant', { method, signal: AbortSignal.any([signal, AbortSignal.timeout(65000)]), headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => null);
  if (!result) throw new Error(`API trợ lý chưa hoạt động (HTTP ${response.status}). Hãy triển khai bản mới nhất trên Vercel rồi tải lại trang.`);
  if (!response.ok) throw new Error(result?.error || 'Chưa kết nối được trợ lý. Hãy kiểm tra cài đặt AI.');
  return result as T;
}

/** Saves settings through the database RPC; the key is never read back. */
export async function saveAISettings(op: 'save' | 'clear', payload: { apiKey?: string; model?: string; allowAgents?: boolean } = {}) {
  const { error } = await requireSupabase().rpc('maoki_ai_settings', { op, payload });
  if (error) throw new Error(error.code === 'PGRST202' ? 'Cần chạy SQL “Cập nhật” tại trang Thiết lập trước khi lưu API key.' : error.message || 'Chưa lưu được cài đặt AI.');
}
