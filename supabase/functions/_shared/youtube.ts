import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import publicConfig from './supabase-public.json' with { type: 'json' };
import type { Env } from './env.ts';

const json = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sync') }).strict(),
  z.object({ action: z.literal('reply'), recordId: z.string().uuid(), text: z.string().trim().min(1).max(4000) }).strict(),
]);
const ID = /^[A-Za-z0-9_.-]{5,120}$/;

interface Context { configured: boolean; config?: Record<string, string>; comment?: { commentId: string } }
interface YouTubeComment { id?: string; snippet?: { authorDisplayName?: string; authorChannelId?: { value?: string }; textOriginal?: string; textDisplay?: string; publishedAt?: string; likeCount?: number } }
interface YouTubeThread { id?: string; snippet?: { videoId?: string; totalReplyCount?: number; topLevelComment?: YouTubeComment }; replies?: { comments?: YouTubeComment[] } }

async function accessToken(config: Record<string, string>, transport: typeof fetch): Promise<string> {
  const response = await transport('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId || '', client_secret: config.clientSecret || '', refresh_token: config.refreshToken || '', grant_type: 'refresh_token' }).toString() });
  const result = await response.json().catch(() => ({})) as { access_token?: string; error?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error === 'invalid_grant' ? 'Refresh token Google đã hết hạn hoặc bị thu hồi. Hãy cấp quyền lại và dán token mới.' : 'Không đăng nhập được Google. Kiểm tra Client ID, Client secret và Refresh token.');
  return result.access_token;
}
async function youtubeError(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({})) as { error?: { errors?: { reason?: string }[]; message?: string } };
  const reason = body.error?.errors?.[0]?.reason || '';
  if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded') return 'Đã hết hạn mức YouTube Data API trong ngày. Hãy thử lại vào ngày mai hoặc xin tăng hạn mức.';
  if (reason === 'commentsDisabled') return 'Video này đã tắt bình luận.';
  if (response.status === 401) return 'Google từ chối thông tin đăng nhập. Hãy kiểm tra lại Refresh token.';
  if (response.status === 403) return 'Tài khoản chưa có quyền với kênh này hoặc chưa cấp scope youtube.force-ssl.';
  if (response.status === 404) return 'Không tìm thấy kênh hoặc bình luận.';
  return `YouTube trả về lỗi ${response.status}: ${(body.error?.message || '').slice(0, 200)}`;
}

/** POST /api/youtube {action:'sync'} or {action:'reply',recordId,text}: comments on the channel's videos. */
export async function handleYouTube(request: Request, env: Env = process.env, transport: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Phương thức không được hỗ trợ.' });
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json(401, { error: 'Vui lòng đăng nhập.' });
  const raw = await request.text(); if (raw.length > 8000) return json(413, { error: 'Yêu cầu quá dài.' });
  let body: z.infer<typeof inputSchema>;
  try { body = inputSchema.parse(JSON.parse(raw)); } catch { return json(400, { error: 'Yêu cầu không hợp lệ.' }); }
  const client = createClient(env.SUPABASE_URL || publicConfig.url, env.SUPABASE_PUBLISHABLE_KEY || publicConfig.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { Authorization: `Bearer ${token}` }, fetch: (url, options) => transport(url, { ...options, signal: AbortSignal.timeout(20000) }) } });
  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError || !user || user.is_anonymous) return json(401, { error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  const rpc = async <T,>(op: string, payload: object = {}) => { const { data, error } = await client.rpc('maoki_youtube', { op, payload }); if (error) throw new Error(error.code === 'PGRST202' ? 'Cần chạy SQL YouTube một lần trong Supabase.' : error.message); return data as T; };
  try {
    const context = await rpc<Context>('context', body.action === 'reply' ? { recordId: body.recordId } : {});
    if (!context.configured || !context.config) return json(200, { ok: false, error: 'Chưa bật YouTube trong Kênh nhắn tin.' });
    const channelId = context.config.channelId || '';
    if (!ID.test(channelId)) return json(200, { ok: false, error: 'Channel ID YouTube chưa hợp lệ (dạng UC…).' });
    const access = await accessToken(context.config, transport);
    const headers = { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' };
    if (body.action === 'reply') {
      const parentId = context.comment?.commentId || '';
      if (!ID.test(parentId)) return json(200, { ok: false, error: 'Không xác định được bình luận trên YouTube. Hãy đồng bộ lại.' });
      const response = await transport('https://www.googleapis.com/youtube/v3/comments?part=snippet', { method: 'POST', signal: AbortSignal.timeout(15000), headers, body: JSON.stringify({ snippet: { parentId, textOriginal: body.text } }) });
      if (!response.ok) return json(200, { ok: false, error: await youtubeError(response) });
      return json(200, { ok: true, repliedAt: new Date().toISOString() });
    }
    const items: object[] = []; let pageToken = '';
    for (let page = 0; page < 5; page++) {
      const response = await transport(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&allThreadsRelatedToChannelId=${encodeURIComponent(channelId)}&maxResults=100&order=time&textFormat=plainText${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, { method: 'GET', signal: AbortSignal.timeout(15000), headers });
      if (!response.ok) return json(200, { ok: false, error: await youtubeError(response) });
      const result = await response.json() as { items?: YouTubeThread[]; nextPageToken?: string };
      for (const thread of result.items || []) {
        const top = thread.snippet?.topLevelComment; const commentId = top?.id || thread.id; const text = top?.snippet?.textOriginal || top?.snippet?.textDisplay || '';
        if (!commentId || !text) continue;
        // A reply written by the channel itself marks the thread as answered.
        const own = (thread.replies?.comments || []).find(item => item.snippet?.authorChannelId?.value === channelId);
        items.push({ commentId, videoId: thread.snippet?.videoId || '', author: top?.snippet?.authorDisplayName || '', authorChannelId: top?.snippet?.authorChannelId?.value || '', text, publishedAt: top?.snippet?.publishedAt || '', likes: top?.snippet?.likeCount || 0, replyCount: thread.snippet?.totalReplyCount || 0, reply: own?.snippet?.textOriginal || own?.snippet?.textDisplay || '', repliedAt: own?.snippet?.publishedAt || '' });
      }
      pageToken = result.nextPageToken || ''; if (!pageToken) break;
    }
    let added = 0; let updated = 0;
    for (let index = 0; index < items.length; index += 100) { const outcome = await rpc<{ added: number; updated: number }>('upsert', { items: items.slice(index, index + 100) }); added += outcome.added; updated += outcome.updated; }
    return json(200, { ok: true, fetched: items.length, added, updated });
  } catch (cause) { return json(200, { ok: false, error: cause instanceof Error ? cause.message.slice(0, 300) : 'Không kết nối được YouTube.' }); }
}
