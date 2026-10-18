import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAssistant } from './_lib/assistant';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(',') : value);
  const response = await handleAssistant(new Request('http://maoki.internal/api/assistant', { method: req.method, headers, ...(req.method === 'POST' ? { body: JSON.stringify(req.body) } : {}) }));
  response.headers.forEach((value, name) => res.setHeader(name, value));
  return res.status(response.status).send(await response.text());
}
