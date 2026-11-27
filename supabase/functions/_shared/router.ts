// Routes one Edge Function URL to the right Maoki handler. Kept separate from index.ts so it can be tested.
import type { Env } from './env.ts';
import { handleChannels } from './channelApi.ts';
import { handleInbound, handleMessaging } from './messaging.ts';
import { handleReviews } from './reviews.ts';
import { handleYouTube } from './youtube.ts';
import { handleWorker } from './worker.ts';

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export async function route(request: Request, environment: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const endpoint = new URL(request.url).pathname.replace(/\/+$/, '').split('/').pop() || '';
  let response: Response;
  switch (endpoint) {
    case 'inbound': {
      // The Zalo and Meta signatures cover the exact bytes, so the body is read once, untouched, and capped.
      const raw = request.method === 'POST' ? (await request.text()).slice(0, 250000) : '';
      const headers = new Headers(); for (const name of ['content-type', 'x-zevent-signature', 'x-hub-signature-256']) { const value = request.headers.get(name); if (value) headers.set(name, value); }
      response = await handleInbound(new Request(request.url, { method: request.method, headers }), raw, environment); break;
    }
    case 'messaging': response = await handleMessaging(request, environment); break;
    case 'reviews': response = await handleReviews(request, environment); break;
    case 'youtube': response = await handleYouTube(request, environment); break;
    case 'channels': response = await handleChannels(request, environment); break;
    case 'worker': response = await handleWorker(request, environment); break;
    default: response = Response.json({ error: 'Không tìm thấy điểm cuối.' }, { status: 404 });
  }
  const out = new Response(response.body, response); for (const [name, value] of Object.entries(cors)) out.headers.set(name, value);
  return out;
}

