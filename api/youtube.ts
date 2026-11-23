import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleYouTube } from './_lib/youtube';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const response = await handleYouTube(new Request('http://maoki.internal/api/youtube', { method: req.method, headers: { authorization: req.headers.authorization || '' }, ...(req.method === 'POST' ? { body: JSON.stringify(req.body) } : {}) }));
  response.headers.forEach((value, name) => res.setHeader(name, value));
  return res.status(response.status).send(await response.text());
}
