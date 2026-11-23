import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleWorker } from './_lib/worker';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const response = await handleWorker(new Request('http://maoki.internal/api/worker', { method: req.method, headers: { authorization: req.headers.authorization || '' } }));
  response.headers.forEach((value, name) => res.setHeader(name, value));
  return res.status(response.status).send(await response.text());
}
