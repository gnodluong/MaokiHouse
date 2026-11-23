import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { lookup as dnsLookup } from 'node:dns/promises';
import { z } from 'zod';
import publicConfig from '../../shared/supabase-public.json';
import { isPublicAddress, publicPost } from './calendars';

const json = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const sendSchema = z.object({ conversationId: z.string().uuid(), text: z.string().trim().min(1).max(3000) }).strict();

export interface SendContext { thread: boolean; configured?: boolean; platform?: 'zalo' | 'email' | 'facebook' | 'instagram' | 'whatsapp' | 'tiktok'; externalId?: string; meta?: { subject?: string; lastMessageId?: string }; config?: Record<string, string> }
export type Mailer = (config: Record<string, string>, message: { to: string; subject: string; text: string; inReplyTo?: string }) => Promise<string>;

function supabase(env: NodeJS.ProcessEnv, transport: typeof fetch, token?: string) {
  return createClient(env.SUPABASE_URL || publicConfig.url, env.SUPABASE_PUBLISHABLE_KEY || publicConfig.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}), fetch: (url, options) => transport(url, { ...options, signal: AbortSignal.timeout(10000) }) } });
}

/** SMTP/Resend delivery. SMTP hosts are resolved here and must be public, so a saved host cannot point at internal services. */
export const defaultMailer: Mailer = async (config, message) => {
  const from = config.fromName ? `"${config.fromName.replaceAll('"', '')}" <${config.fromAddress}>` : config.fromAddress;
  if (config.provider === 'resend') {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, ...(message.inReplyTo ? { headers: { 'In-Reply-To': message.inReplyTo, References: message.inReplyTo } } : {}) }) });
    const result = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) throw new Error(result.message || `Resend trả về lỗi ${response.status}`);
    return result.id || '';
  }
  const port = Number(config.smtpPort || 587);
  if (!config.smtpHost || ![25, 465, 587, 2525].includes(port)) throw new Error('Cấu hình SMTP chưa hợp lệ (cổng 25, 465, 587 hoặc 2525).');
  const addresses = await dnsLookup(config.smtpHost, { all: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error('Máy chủ SMTP phải là địa chỉ công khai.');
  const transporter = nodemailer.createTransport({ host: addresses[0].address, port, secure: port === 465, requireTLS: port !== 465, auth: { user: config.smtpUser, pass: config.smtpPass }, tls: { servername: config.smtpHost }, connectionTimeout: 10000, socketTimeout: 15000 });
  const info = await transporter.sendMail({ from, to: message.to, subject: message.subject, text: message.text, ...(message.inReplyTo ? { inReplyTo: message.inReplyTo, references: message.inReplyTo } : {}) });
  return info.messageId || '';
};

export async function sendZalo(context: SendContext, text: string, transport: typeof fetch, save: (tokens: { accessToken: string; refreshToken: string; tokenExpiresAt: string }) => Promise<void>) {
  const config = context.config || {};
  const post = (accessToken: string) => transport('https://openapi.zalo.me/v3.0/oa/message/cs', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', access_token: accessToken }, body: JSON.stringify({ recipient: { user_id: context.externalId }, message: { text } }) });
  let result = await (await post(config.accessToken || '')).json().catch(() => ({})) as { error?: number; message?: string };
  // -216 / -124: access token invalid or expired. Refresh once (refresh tokens are single-use, so store the new pair).
  if ([-216, -124].includes(Number(result.error)) && config.refreshToken && config.appSecret) {
    const refreshed = await (await transport('https://oauth.zaloapp.com/v4/oa/access_token', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded', secret_key: config.appSecret }, body: new URLSearchParams({ app_id: config.appId || '', grant_type: 'refresh_token', refresh_token: config.refreshToken }).toString() })).json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: string | number; error?: number; error_description?: string };
    if (!refreshed.access_token || !refreshed.refresh_token) throw new Error('Token Zalo đã hết hạn và chưa làm mới được. Hãy dán lại Access/Refresh token trong Kết nối kênh.');
    await save({ accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token, tokenExpiresAt: new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString() });
    result = await (await post(refreshed.access_token)).json().catch(() => ({})) as { error?: number; message?: string };
  }
  if (result.error !== 0) throw new Error(result.error === -233 || /48|interaction/i.test(result.message || '') ? 'Zalo chỉ cho phép trả lời trong 48 giờ kể từ tin nhắn cuối của khách.' : `Zalo từ chối gửi tin: ${result.message || result.error}`);
}

/** Messenger / Instagram: Send API with the Page access token. Replies are allowed within 24 hours of the guest's last message. */
export async function sendMeta(context: SendContext, text: string, transport: typeof fetch) {
  const config = context.config || {};
  if (!config.pageAccessToken) throw new Error('Chưa có Page access token.');
  const response = await transport(`https://graph.facebook.com/v21.0/${encodeURIComponent(config.pageId || 'me')}/messages`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.pageAccessToken}` }, body: JSON.stringify({ recipient: { id: context.externalId }, messaging_type: 'RESPONSE', message: { text } }) });
  const result = await response.json().catch(() => ({})) as { error?: { message?: string; code?: number; error_subcode?: number } };
  if (response.ok && !result.error) return;
  const code = result.error?.code; const message = result.error?.message || `HTTP ${response.status}`;
  if (code === 190) throw new Error('Page access token đã hết hạn hoặc bị thu hồi. Hãy tạo token mới trong Meta for Developers.');
  if (code === 10 || code === 551 || /outside of allowed window|24/i.test(message)) throw new Error('Meta chỉ cho phép trả lời trong 24 giờ kể từ tin nhắn cuối của khách.');
  throw new Error(`${context.platform === 'instagram' ? 'Instagram' : 'Facebook'} từ chối gửi tin: ${message}`);
}

/** WhatsApp Business Cloud API. Free-form replies are only allowed within 24 hours of the customer's last message. */
export async function sendWhatsApp(context: SendContext, text: string, transport: typeof fetch) {
  const config = context.config || {};
  if (!config.accessToken || !config.phoneNumberId) throw new Error('Chưa có Phone number ID hoặc Access token của WhatsApp.');
  const response = await transport(`https://graph.facebook.com/v21.0/${encodeURIComponent(config.phoneNumberId)}/messages`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.accessToken}` }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: context.externalId, type: 'text', text: { body: text, preview_url: false } }) });
  const result = await response.json().catch(() => ({})) as { error?: { message?: string; code?: number } };
  if (response.ok && !result.error) return;
  const code = result.error?.code; const message = result.error?.message || `HTTP ${response.status}`;
  if (code === 190) throw new Error('Access token WhatsApp đã hết hạn. Hãy tạo token hệ thống (System User) vĩnh viễn trong Meta Business.');
  if ((code === 131047 || code === 131051 || /re-engagement|24 hours/i.test(message)) && config.templateName) {
    // Outside the 24-hour window only an approved template can be sent; the text becomes its single body parameter.
    const retry = await transport(`https://graph.facebook.com/v21.0/${encodeURIComponent(config.phoneNumberId)}/messages`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.accessToken}` }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: context.externalId, type: 'template', template: { name: config.templateName, language: { code: config.templateLang || 'vi' }, components: [{ type: 'body', parameters: [{ type: 'text', text: text.slice(0, 1000) }] }] } }) });
    const second = await retry.json().catch(() => ({})) as { error?: { message?: string } };
    if (retry.ok && !second.error) return;
    throw new Error(`WhatsApp từ chối mẫu tin “${config.templateName}”: ${second.error?.message || `HTTP ${retry.status}`}`);
  }
  if (code === 131047 || code === 131051 || /re-engagement|24 hours/i.test(message)) throw new Error('WhatsApp chỉ cho phép nhắn tự do trong 24 giờ kể từ tin cuối của khách; ngoài khung đó cần gửi mẫu tin (template) đã duyệt.');
  if (code === 131030) throw new Error('Số này chưa nằm trong danh sách người nhận thử của ứng dụng WhatsApp.');
  throw new Error(`WhatsApp từ chối gửi tin: ${message}`);
}

/** TikTok has no public self-serve messaging API, so replies are posted to the bridge URL configured for the channel. */
export async function sendTikTok(context: SendContext, conversationId: string, text: string, bridge: typeof fetch) {
  const config = context.config || {};
  if (!config.outboundUrl) throw new Error('Chưa cấu hình địa chỉ cầu nối gửi tin TikTok.');
  const response = await bridge(config.outboundUrl, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', ...(config.outboundToken ? { Authorization: `Bearer ${config.outboundToken}` } : {}) }, body: JSON.stringify({ to: context.externalId, text, conversationId }) });
  if (!response.ok) throw new Error(`Cầu nối TikTok trả về lỗi ${response.status}.`);
}

export interface Transports { transport: typeof fetch; mailer: Mailer; bridge: typeof fetch; saveZaloTokens: (tokens: { accessToken: string; refreshToken: string; tokenExpiresAt: string }) => Promise<void> }
/** Deliver one message through the channel in `context` (shared by the interactive send endpoint and the background worker). */
export async function deliverMessage(context: SendContext, text: string, conversationId: string, t: Transports): Promise<void> {
  if (context.platform === 'zalo') return sendZalo(context, text, t.transport, t.saveZaloTokens);
  if (context.platform === 'facebook' || context.platform === 'instagram') return sendMeta(context, text, t.transport);
  if (context.platform === 'whatsapp') return sendWhatsApp(context, text, t.transport);
  if (context.platform === 'tiktok') return sendTikTok(context, conversationId, text, t.bridge);
  const config = context.config || {};
  if (!config.fromAddress || (config.provider === 'resend' ? !config.resendKey : !config.smtpHost)) throw new Error('Cấu hình email chưa đầy đủ.');
  const subject = context.meta?.subject ? (/^re:/i.test(context.meta.subject) ? context.meta.subject : `Re: ${context.meta.subject}`) : `Phản hồi từ ${config.fromName || 'MaokiHouse'}`;
  await t.mailer(config, { to: context.externalId || '', subject, text, inReplyTo: context.meta?.lastMessageId || undefined });
}

/** POST /api/messaging {conversationId,text}: deliver a host reply to the guest's Zalo OA or email thread. */
export async function handleMessaging(request: Request, env: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch, mailer: Mailer = defaultMailer, bridge: typeof fetch = publicPost): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Phương thức không được hỗ trợ.' });
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json(401, { error: 'Vui lòng đăng nhập.' });
  const raw = await request.text(); if (raw.length > 8000) return json(413, { error: 'Yêu cầu quá dài.' });
  let body: z.infer<typeof sendSchema>;
  try { body = sendSchema.parse(JSON.parse(raw)); } catch { return json(400, { error: 'Yêu cầu không hợp lệ.' }); }
  const client = supabase(env, transport, token);
  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError || !user || user.is_anonymous) return json(401, { error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  const { data, error } = await client.rpc('maoki_channel_accounts', { op: 'send_context', payload: { conversationId: body.conversationId } });
  if (error) return json(error.code === 'PGRST202' ? 503 : 400, { error: error.code === 'PGRST202' ? 'Cần chạy SQL kênh nhắn tin một lần trong Supabase.' : error.message });
  const context = data as SendContext;
  if (!context.thread) return json(200, { sent: false, skipped: true });
  if (!context.configured) return json(200, { sent: false, error: 'Kênh này chưa được bật trong Kết nối kênh.' });
  try {
    await deliverMessage(context, body.text, body.conversationId, { transport, mailer, bridge, saveZaloTokens: async tokens => { await client.rpc('maoki_channel_accounts', { op: 'tokens', payload: tokens }); } });
    return json(200, { sent: true });
  } catch (cause) { return json(200, { sent: false, error: cause instanceof Error ? cause.message.slice(0, 300) : 'Không gửi được tin nhắn.' }); }
}

// ── Inbound ────────────────────────────────────────────────────────────────
const QUOTE_START = /^(on .{5,200} wrote:|vào .{5,200} đã viết:|-{2,}\s*(original message|tin nhắn gốc)|_{5,}|from:\s.+<.+>|>)/i;
export function stripQuotedReply(text: string): string {
  const lines = text.replaceAll('\r', '').split('\n'); const keep: string[] = [];
  for (const line of lines) { if (QUOTE_START.test(line.trim())) break; keep.push(line); }
  return (keep.join('\n').trim() || text.trim()).slice(0, 3000);
}
const parseAddress = (value: string) => { const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/); return match ? { name: match[1].trim(), from: match[2].trim() } : { name: '', from: value.trim() }; };

/** Accepts Postmark inbound JSON, Mailgun/SendGrid-style form posts, or a plain {from,name,subject,text,messageId} JSON body. */
export function normaliseEmail(contentType: string, raw: string): { from: string; name: string; subject: string; text: string; fullText: string; messageId: string; timestamp: string } | null {
  let fields: Record<string, string> = {};
  try {
    if (/json/i.test(contentType)) { const body = JSON.parse(raw) as Record<string, unknown>; fields = Object.fromEntries(Object.entries(body).filter(([, value]) => typeof value === 'string')) as Record<string, string>; }
    else for (const [key, value] of new URLSearchParams(raw)) fields[key] = value;
  } catch { return null; }
  const rawFrom = fields.From || fields.from || fields.sender || '';
  const address = parseAddress(rawFrom);
  const text = fields.TextBody || fields.text || fields['body-plain'] || fields['stripped-text'] || fields.StrippedTextReply || '';
  if (!address.from || !text.trim()) return null;
  return { from: address.from, name: fields.FromName || fields.name || address.name, subject: fields.Subject || fields.subject || '', text: stripQuotedReply(text), fullText: text.trim().slice(0, 3000), messageId: fields.MessageID || fields.messageId || fields['Message-Id'] || fields['Message-ID'] || '', timestamp: /^\d{10,13}$/.test(fields.timestamp || '') ? (fields.timestamp.length === 10 ? fields.timestamp + '000' : fields.timestamp) : '' };
}

export interface CallEvent { callId: string; direction: 'inbound' | 'outbound'; from: string; to: string; status: string; durationSec: number; startedAt: string; recordingUrl: string }
/** Maps provider call statuses (Twilio-style and generic) onto answered / missed / busy / failed / voicemail. */
export function callStatus(raw: string, durationSec: number): string {
  const value = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (['answered', 'completed', 'connected', 'success'].includes(value)) return durationSec > 0 || value === 'answered' ? 'answered' : 'missed';
  if (['missed', 'noanswer', 'canceled', 'cancelled', 'unanswered', 'ringing', 'abandoned'].includes(value)) return 'missed';
  if (value === 'busy') return 'busy';
  if (value === 'voicemail') return 'voicemail';
  if (['failed', 'error', 'rejected'].includes(value)) return 'failed';
  return durationSec > 0 ? 'answered' : 'missed';
}
/** Accepts a plain JSON call event or Twilio-style form fields (CallSid, From, To, CallStatus, CallDuration, Direction, RecordingUrl). */
export function normaliseCall(contentType: string, raw: string): CallEvent | null {
  let fields: Record<string, string> = {};
  try {
    if (/json/i.test(contentType)) { const body = JSON.parse(raw) as Record<string, unknown>; fields = Object.fromEntries(Object.entries(body).filter(([, value]) => ['string', 'number'].includes(typeof value)).map(([key, value]) => [key, String(value)])); }
    else for (const [key, value] of new URLSearchParams(raw)) fields[key] = value;
  } catch { return null; }
  const callId = fields.callId || fields.CallSid || fields.call_id || '';
  const from = fields.from || fields.From || fields.caller || ''; const to = fields.to || fields.To || fields.callee || '';
  if (!callId || !(from || to)) return null;
  const direction = /^outbound/i.test(fields.direction || fields.Direction || '') ? 'outbound' : 'inbound';
  const durationSec = Math.max(0, Math.min(86400, Math.round(Number(fields.durationSec || fields.duration || fields.CallDuration || 0)) || 0));
  const stamp = fields.startedAt || fields.timestamp || '';
  const startedAt = /^\d{10,13}$/.test(stamp) ? new Date(stamp.length === 10 ? Number(stamp) * 1000 : Number(stamp)).toISOString() : /^\d{4}-\d{2}-\d{2}T/.test(stamp) ? stamp : '';
  const recording = fields.recordingUrl || fields.RecordingUrl || '';
  return { callId: callId.slice(0, 120), direction, from, to, status: callStatus(fields.status || fields.CallStatus || '', durationSec), durationSec, startedAt, recordingUrl: /^https:\/\/[^\s/]+/.test(recording) ? recording : '' };
}

/** /api/inbound?token=… Zalo OA, Facebook/Instagram (signed webhooks, GET handshake) or an email-forwarding webhook. */
export async function handleInbound(request: Request, rawBody: string, env: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url); const token = url.searchParams.get('token') || '';
  if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Phương thức không được hỗ trợ.' });
  if (!/^[a-f0-9]{64}$/.test(token)) return json(404, { error: 'Liên kết không hợp lệ.' });
  // Meta subscription handshake: echo hub.challenge when hub.verify_token matches this account's token.
  if (request.method === 'GET') {
    const challenge = url.searchParams.get('hub.challenge') || '';
    if (url.searchParams.get('hub.mode') !== 'subscribe' || !challenge || challenge.length > 200) return json(400, { error: 'Yêu cầu không hợp lệ.' });
    const { data, error } = await supabase(env, transport).rpc('maoki_channel_verify', { token, verify: url.searchParams.get('hub.verify_token') || '' });
    return error || data !== true ? json(403, { error: 'Mã xác minh không đúng.' }) : new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
  }
  if (rawBody.length > 250000) return json(413, { error: 'Yêu cầu quá lớn.' });
  const client = supabase(env, transport);
  const metaSignature = request.headers.get('x-hub-signature-256') || '';
  const signature = metaSignature || request.headers.get('x-zevent-signature') || '';
  const signed = Boolean(signature) || /"event_name"\s*:|"object"\s*:\s*"(page|instagram)"/.test(rawBody);
  let result;
  if (signed) result = await client.rpc('maoki_channel_inbound', { token, raw: rawBody, signature });
  else {
    const contentType = request.headers.get('content-type') || '';
    const email = normaliseEmail(contentType, rawBody); const call = normaliseCall(contentType, rawBody);
    if (!email && !call) return json(200, { ok: true, ignored: true });
    // The account's platform decides which part is used (email/TikTok read the message fields, a phone line reads `call`).
    result = await client.rpc('maoki_channel_inbound', { token, payload: { ...(email || {}), ...(call ? { call } : {}) } });
  }
  if (result.error) {
    const rejected = result.error.code === 'P0001';
    return json(rejected ? 403 : 503, { error: rejected ? 'Yêu cầu bị từ chối.' : 'Dịch vụ dữ liệu chưa sẵn sàng.' });
  }
  return json(200, { ok: true });
}
