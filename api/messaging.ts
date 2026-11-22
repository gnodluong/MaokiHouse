import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleMessaging } from './_lib/messaging';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const response = await handleMessaging(new Request('http://maoki.internal/api/messaging', { method: req.method, headers: { authorization: req.headers.authorization || '' }, ...(req.method === 'POST' ? { body: JSON.stringify(req.body) } : {}) }));
  response.headers.forEach((value, name) => res.setHeader(name, value));
  return res.status(response.status).send(await response.text());
}
