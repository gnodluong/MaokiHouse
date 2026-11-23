import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import publicConfig from '../../shared/supabase-public.json';

const json = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sync') }).strict(),
  z.object({ action: z.literal('reply'), recordId: z.string().uuid(), text: z.string().trim().min(1).max(4000) }).strict(),
]);
const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
export const REVIEW_NAME = /^accounts\/\d+\/locations\/\d+\/reviews\/[A-Za-z0-9_-]+$/;

interface Context { configured: boolean; config?: Record<string, string>; review?: { reviewName: string; reviewId: string } }
interface GoogleReview { reviewId?: string; name?: string; reviewer?: { displayName?: string }; starRating?: string; comment?: string; createTime?: string; reviewReply?: { comment?: string; updateTime?: string } }

export async function accessToken(config: Record<string, string>, transport: typeof fetch): Promise<string> {
  const response = await transport('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId || '', client_secret: config.clientSecret || '', refresh_token: config.refreshToken || '', grant_type: 'refresh_token' }).toString() });
  const result = await response.json().catch(() => ({})) as { access_token?: string; error?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error === 'invalid_grant' ? 'Refresh token Google đã hết hạn hoặc bị thu hồi. Hãy cấp quyền lại và dán token mới.' : 'Không đăng nhập được Google. Kiểm tra Client ID, Client secret và Refresh token.');
  return result.access_token;
}
export function googleError(status: number, message: string) {
  if (status === 401) return 'Google từ chối thông tin đăng nhập. Hãy kiểm tra lại Refresh token.';
  if (status === 403) return 'Tài khoản chưa được cấp quyền Google Business Profile API (cần Google duyệt quyền truy cập API cho dự án của bạn) hoặc không quản lý địa điểm này.';
  if (status === 404) return 'Không tìm thấy địa điểm. Kiểm tra Account ID và Location ID.';
  if (status === 429) return 'Google đang giới hạn lượt gọi API. Hãy thử lại sau ít phút.';
  return `Google Business trả về lỗi ${status}: ${message.slice(0, 200)}`;
}

/** POST /api/reviews {action:'sync'} or {action:'reply',recordId,text}: Google Business Profile reviews for the signed-in workspace. */
export async function handleReviews(request: Request, env: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Phương thức không được hỗ trợ.' });
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json(401, { error: 'Vui lòng đăng nhập.' });
  const raw = await request.text(); if (raw.length > 8000) return json(413, { error: 'Yêu cầu quá dài.' });
  let body: z.infer<typeof inputSchema>;
  try { body = inputSchema.parse(JSON.parse(raw)); } catch { return json(400, { error: 'Yêu cầu không hợp lệ.' }); }
  const client = createClient(env.SUPABASE_URL || publicConfig.url, env.SUPABASE_PUBLISHABLE_KEY || publicConfig.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { Authorization: `Bearer ${token}` }, fetch: (url, options) => transport(url, { ...options, signal: AbortSignal.timeout(20000) }) } });
  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError || !user || user.is_anonymous) return json(401, { error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  const rpc = async <T,>(op: string, payload: object = {}) => { const { data, error } = await client.rpc('maoki_reviews', { op, payload }); if (error) throw new Error(error.code === 'PGRST202' ? 'Cần chạy SQL tổng đài và đánh giá một lần trong Supabase.' : error.message); return data as T; };
  try {
    const context = await rpc<Context>('context', body.action === 'reply' ? { recordId: body.recordId } : {});
    if (!context.configured || !context.config) return json(200, { ok: false, error: 'Chưa bật Google Business trong Kênh nhắn tin.' });
    const { accountId, locationId } = context.config;
    if (!/^\d+$/.test(accountId || '') || !/^\d+$/.test(locationId || '')) return json(200, { ok: false, error: 'Account ID và Location ID của Google Business phải là số.' });
    const access = await accessToken(context.config, transport);
    const headers = { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' };
    if (body.action === 'reply') {
      const name = context.review?.reviewName || '';
      if (!REVIEW_NAME.test(name) || !name.startsWith(`accounts/${accountId}/locations/${locationId}/`)) return json(200, { ok: false, error: 'Không xác định được đánh giá trên Google. Hãy đồng bộ lại.' });
      const response = await transport(`https://mybusiness.googleapis.com/v4/${name}/reply`, { method: 'PUT', signal: AbortSignal.timeout(15000), headers, body: JSON.stringify({ comment: body.text }) });
      if (!response.ok) return json(200, { ok: false, error: googleError(response.status, await response.text().catch(() => '')) });
      return json(200, { ok: true, repliedAt: new Date().toISOString() });
    }
    const items: object[] = []; let pageToken = '';
    for (let page = 0; page < 6; page++) {
      const response = await transport(`https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews?pageSize=50&orderBy=updateTime%20desc${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, { method: 'GET', signal: AbortSignal.timeout(15000), headers });
      if (!response.ok) return json(200, { ok: false, error: googleError(response.status, await response.text().catch(() => '')) });
      const result = await response.json() as { reviews?: GoogleReview[]; nextPageToken?: string };
      for (const review of result.reviews || []) {
        const rating = STARS[review.starRating || '']; const reviewId = review.reviewId || review.name?.split('/').at(-1);
        if (!rating || !reviewId) continue;
        items.push({ reviewId, reviewName: review.name && REVIEW_NAME.test(review.name) ? review.name : `accounts/${accountId}/locations/${locationId}/reviews/${reviewId}`, reviewer: review.reviewer?.displayName || '', rating, comment: review.comment || '', reviewedAt: review.createTime || '', reply: review.reviewReply?.comment || '', repliedAt: review.reviewReply?.updateTime || '' });
      }
      pageToken = result.nextPageToken || ''; if (!pageToken) break;
    }
    let added = 0; let updated = 0;
    for (let index = 0; index < items.length; index += 100) { const outcome = await rpc<{ added: number; updated: number }>('upsert', { items: items.slice(index, index + 100) }); added += outcome.added; updated += outcome.updated; }
    return json(200, { ok: true, fetched: items.length, added, updated });
  } catch (cause) { return json(200, { ok: false, error: cause instanceof Error ? cause.message.slice(0, 300) : 'Không kết nối được Google Business.' }); }
}
