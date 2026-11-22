import { requireSupabase } from '../lib/supabase/client';
import { apiUrl } from './apiBase';

export type ChannelPlatform = 'zalo' | 'email';
export interface ChannelAccount { platform: ChannelPlatform; label: string; enabled: boolean; inboundToken: string; updatedAt: string; updatedBy: string; config: Record<string, string | boolean> }

export interface SendOutcome { sent: boolean; skipped?: boolean; error?: string }

/** Deliver a saved host reply to the guest's Zalo OA / email thread. */
export async function sendThroughChannel(conversationId: string, text: string): Promise<SendOutcome> {
  const { data: { session } } = await requireSupabase().auth.getSession();
  if (!session) throw new Error('Vui lòng đăng nhập lại.');
  const response = await fetch(apiUrl('/api/messaging'), { method: 'POST', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, text }) });
  const result = await response.json().catch(() => null);
  if (!result) throw new Error(`API gửi tin chưa hoạt động (HTTP ${response.status}). Kiểm tra máy chủ API và bản triển khai mới nhất.`);
  if (!response.ok) throw new Error(result.error || 'Không gửi được tin nhắn.');
  return result;
}

export async function channelAccounts(op: string, payload: unknown = {}): Promise<unknown> {
  const { data, error } = await requireSupabase().rpc('maoki_channel_accounts', { op, payload });
  if (error) throw new Error(error.code === 'PGRST202' ? 'Cần chạy SQL kênh nhắn tin (20261123090000_maoki_messaging_channels.sql) một lần trong Supabase.' : error.message);
  return data;
}
