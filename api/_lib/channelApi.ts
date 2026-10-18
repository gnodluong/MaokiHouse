import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import publicConfig from '../../shared/supabase-public.json';
import { CalendarInputError, calendarURL, exportCalendar, fetchCalendar } from './calendars';
import type { CalendarEvent } from './calendars';

const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect'), platform: z.enum(['airbnb', 'booking']), propertyId: z.string().uuid(), url: z.string().trim().min(10).max(4096) }).strict(),
  z.object({ action: z.literal('sync'), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('disconnect'), id: z.string().uuid() }).strict(),
]);
const json = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function handleChannels(request: Request, env: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch): Promise<Response> {
  if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Phương thức không được hỗ trợ.' });
  const feed = new URL(request.url).searchParams.get('feed');
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (feed === null && !token) return json(401, { error: 'Vui lòng đăng nhập.' });
  const client = createClient(env.SUPABASE_URL || publicConfig.url, env.SUPABASE_PUBLISHABLE_KEY || publicConfig.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { ...(feed === null ? { headers: { Authorization: `Bearer ${token}` } } : {}), fetch: (url, options) => transport(url, { ...options, signal: AbortSignal.timeout(10000) }) } });
  const rpc = async <T,>(op: string, connectionId?: string, payload: unknown = {}): Promise<T> => {
    const { data, error } = await client.rpc('maoki_channels', { op, connection_id: connectionId || null, payload });
    if (error) { if (error.code === 'PGRST202') throw new CalendarInputError('Cần cập nhật dữ liệu iCal một lần tại trang Thiết lập.'); throw new CalendarInputError(error.code === 'P0001' ? error.message : 'Chưa thực hiện được yêu cầu dữ liệu. Hãy thử lại.'); }
    return data as T;
  };
  const sync = async (id: string) => {
    const claim = await rpc<{ nonce: string; url: string; platform: string }>('claim', id);
    try { const events = await fetchCalendar(claim.url, claim.platform, transport); return await rpc<{ synced: boolean; blockCount: number; conflictCount: number }>('finish', id, { nonce: claim.nonce, events }); }
    catch (error) { try { await rpc('fail', id, { nonce: claim.nonce }); } catch { /* Keep previous blocks even if the lease expired. */ } throw error; }
  };
  try {
    if (feed !== null) {
      if (request.method !== 'GET' || !/^[a-f0-9]{64}$/.test(feed)) return json(404, { error: 'Liên kết lịch không hợp lệ.' });
      const { data, error } = await client.rpc('maoki_calendar_feed', { feed_token: feed });
      if (error) return json(503, { error: 'Lịch chưa sẵn sàng.' });
      if (!data) return json(404, { error: 'Liên kết lịch không còn hiệu lực.' });
      return new Response(exportCalendar((data as { events: CalendarEvent[] }).events), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="maokihouse.ics"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user || user.is_anonymous) return json(401, { error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    if (request.method === 'GET') return json(200, { connections: await rpc('list') });
    const raw = await request.text(); if (raw.length > 10000) return json(413, { error: 'Yêu cầu quá dài.' });
    let parsed: ReturnType<typeof inputSchema.safeParse>;
    try { parsed = inputSchema.safeParse(JSON.parse(raw)); } catch { return json(400, { error: 'Yêu cầu không hợp lệ.' }); }
    if (!parsed.success) return json(400, { error: 'Thông tin kết nối không hợp lệ.' });
    const body = parsed.data;
    if (body.action === 'disconnect') { await rpc('disconnect', body.id); return json(200, { disconnected: true }); }
    if (body.action === 'sync') return json(200, await sync(body.id));
    calendarURL(body.url, body.platform);
    const saved = await rpc<{ id: string }>('save', undefined, { platform: body.platform, propertyId: body.propertyId, url: body.url });
    try { return json(200, { saved: true, id: saved.id, ...await sync(saved.id) }); }
    catch (error) { return json(200, { saved: true, id: saved.id, synced: false, error: error instanceof CalendarInputError ? error.message : 'Đã lưu kết nối nhưng chưa tải được lịch. Hãy thử đồng bộ lại.' }); }
  } catch (error) { return json(400, { error: error instanceof CalendarInputError ? error.message : 'Không kết nối được dịch vụ lịch. Vui lòng thử lại.' }); }
}
