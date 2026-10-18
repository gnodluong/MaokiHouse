import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleChannels } from './_lib/channelApi';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const response = await handleChannels(new Request(new URL(req.url || '/api/channels', 'https://maoki.internal'), { method: req.method, headers: { authorization: req.headers.authorization || '' }, ...(req.method === 'POST' ? { body: JSON.stringify(req.body) } : {}) }));
  response.headers.forEach((value, name) => res.setHeader(name, value));
  return res.status(response.status).send(await response.text());
}
