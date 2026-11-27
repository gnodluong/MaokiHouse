import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import publicConfig from './supabase-public.json' with { type: 'json' };
import { isPublicAddress, publicPost } from './calendars.ts';
import { defaultMailer, deliverMessage, stripQuotedReply } from './messaging.ts';
import type { Mailer, SendContext } from './messaging.ts';
import { REVIEW_NAME, accessToken, googleError } from './reviews.ts';
import type { Env } from './env.ts';

const json = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export interface MailItem { from: string; name: string; subject: string; text: string; messageId: string }
export type MailFetcher = (config: Record<string, string>) => Promise<MailItem[]>;
interface Job { id: string; workspaceId: string; platform: SendContext['platform']; externalId: string; conversationId: string | null; text: string; config: Record<string, string>; meta: SendContext['meta'] }

/** Reads unseen mail over IMAPS. The host must resolve to public addresses only; messages are marked seen once fetched. */
export const defaultMailFetcher: MailFetcher = async config => {
  const port = Number(config.imapPort || 993);
  if (!config.imapHost || ![993, 143].includes(port)) throw new Error('Cấu hình IMAP chưa hợp lệ (cổng 993 hoặc 143).');
  const addresses = await dnsLookup(config.imapHost, { all: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error('Máy chủ IMAP phải là địa chỉ công khai.');
  const client = new ImapFlow({ host: addresses[0].address, port, secure: port === 993, servername: config.imapHost, auth: { user: config.imapUser, pass: config.imapPass }, logger: false, tls: { servername: config.imapHost } } as never);
  const items: MailItem[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const unseen = (await client.search({ seen: false }, { uid: true })) || [];
      for (const uid of unseen.slice(0, 20)) {
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!message || !message.source) continue;
        const parsed = await simpleParser(message.source);
        const sender = parsed.from?.value[0];
        const text = (parsed.text || '').trim();
        if (sender?.address && text) items.push({ from: sender.address, name: sender.name || '', subject: parsed.subject || '', text: stripQuotedReply(text), messageId: parsed.messageId || '' });
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      }
    } finally { lock.release(); }
  } finally { await client.logout().catch(() => undefined); }
  return items;
};

export interface WorkerDeps { transport?: typeof fetch; mailer?: Mailer; bridge?: typeof fetch; mailFetcher?: MailFetcher }

/** POST/GET /api/worker — called every few minutes (GitHub Actions or pg_cron) with `Authorization: Bearer WORKER_SECRET`. */
export async function handleWorker(request: Request, env: Env = process.env, deps: WorkerDeps = {}): Promise<Response> {
  if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Phương thức không được hỗ trợ.' });
  const secret = env.WORKER_SECRET || ''; const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (secret.length < 24 || !serviceKey) return json(503, { error: 'Worker chưa được cấu hình: cần WORKER_SECRET (≥24 ký tự) và SUPABASE_SERVICE_ROLE_KEY.' });
  const given = Buffer.from(request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1] || ''); const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return json(401, { error: 'Không được phép.' });
  const transport = deps.transport || fetch; const mailer = deps.mailer || defaultMailer; const bridge = deps.bridge || publicPost; const fetchMail = deps.mailFetcher || defaultMailFetcher;
  const client = createClient(env.SUPABASE_URL || publicConfig.url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (url, options) => transport(url, { ...options, signal: AbortSignal.timeout(20000) }) } });
  const rpc = async <T,>(name: string, args: object = {}) => { const { data, error } = await client.rpc(name, args); if (error) throw new Error(`${name}: ${error.message}`); return data as T; };
  const summary = { journeysQueued: 0, sent: 0, failed: 0, mailFetched: 0, mailErrors: [] as string[], reviewsReplied: 0, errors: [] as string[] };
  const step = async (label: string, fn: () => Promise<void>) => { try { await fn(); } catch (cause) { summary.errors.push(`${label}: ${cause instanceof Error ? cause.message.slice(0, 200) : 'lỗi'}`); } };

  await step('journeys', async () => { summary.journeysQueued = (await rpc<{ queued: number }>('maoki_worker_tick')).queued; });

  // Inbox first, so replies queued by bots/automations while importing are sent in the same run.
  await step('imap', async () => {
    const accounts = await rpc<{ workspaceId: string; token: string; config: Record<string, string> }[]>('maoki_worker_email_accounts');
    for (const account of accounts) {
      try {
        for (const mail of await fetchMail(account.config)) {
          await rpc('maoki_channel_inbound', { token: account.token, payload: { from: mail.from, name: mail.name, subject: mail.subject, text: mail.text, fullText: mail.text, messageId: mail.messageId } });
          summary.mailFetched++;
        }
      } catch (cause) { summary.mailErrors.push(cause instanceof Error ? cause.message.slice(0, 160) : 'IMAP lỗi'); }
    }
  });

  await step('queue', async () => {
    const jobs = await rpc<Job[]>('maoki_worker_claim', { batch: 25 });
    for (const job of jobs) {
      try {
        if (!job.config || !Object.keys(job.config).length) throw new Error('Kênh chưa được bật trong Kênh nhắn tin.');
        const context: SendContext = { thread: true, configured: true, platform: job.platform, externalId: job.externalId, meta: job.meta, config: job.config };
        await deliverMessage(context, job.text, job.conversationId || job.id, { transport, mailer, bridge, saveZaloTokens: async tokens => { await rpc('maoki_worker_tokens', { w: job.workspaceId, tokens }); } });
        await rpc('maoki_worker_done', { job: job.id, ok: true, err: '' }); summary.sent++;
      } catch (cause) {
        await rpc('maoki_worker_done', { job: job.id, ok: false, err: cause instanceof Error ? cause.message : 'Không gửi được' }); summary.failed++;
      }
    }
  });

  // Opt-in public replies to new Google reviews at or above the configured star rating.
  await step('reviews', async () => {
    const candidates = await rpc<{ recordId: string; reviewName: string; text: string; config: Record<string, string> }[]>('maoki_worker_review_candidates');
    const tokens = new Map<string, string>();
    for (const item of candidates) {
      try {
        if (!REVIEW_NAME.test(item.reviewName) || !item.reviewName.startsWith(`accounts/${item.config.accountId}/locations/${item.config.locationId}/`)) continue;
        const key = item.config.refreshToken || ''; if (!tokens.has(key)) tokens.set(key, await accessToken(item.config, transport));
        const response = await transport(`https://mybusiness.googleapis.com/v4/${item.reviewName}/reply`, { method: 'PUT', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${tokens.get(key)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: item.text }) });
        if (!response.ok) throw new Error(googleError(response.status, await response.text().catch(() => '')));
        await rpc('maoki_worker_review_replied', { rec: item.recordId, reply_text: item.text }); summary.reviewsReplied++;
      } catch (cause) { summary.errors.push(`review: ${cause instanceof Error ? cause.message.slice(0, 160) : 'lỗi'}`); }
    }
  });
  return json(200, { ok: summary.errors.length === 0, ...summary });
}
