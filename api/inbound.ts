import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleInbound } from './_lib/messaging';

// The Zalo signature covers the exact request bytes, so the body must not be parsed before it is verified.
export const config = { api: { bodyParser: false } };

async function readBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > 250000) break; chunks.push(buffer); }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const headers = new Headers(); for (const name of ['content-type', 'x-zevent-signature', 'x-hub-signature-256']) { const value = req.headers[name]; if (typeof value === 'string') headers.set(name, value); }
  const response = await handleInbound(new Request(new URL(req.url || '/api/inbound', 'https://maoki.internal'), { method: req.method, headers }), req.method === 'POST' ? await readBody(req) : '');
  response.headers.forEach((value, name) => res.setHeader(name, value));
  return res.status(response.status).send(await response.text());
}
