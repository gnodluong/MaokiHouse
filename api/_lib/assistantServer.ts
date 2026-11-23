import 'dotenv/config';
import express from 'express';
import { handleAssistant } from './assistant';
import { handleChannels } from './channelApi';
import { handleInbound, handleMessaging } from './messaging';
import { handleReviews } from './reviews';
import { handleYouTube } from './youtube';

const app = express();
app.use((req, res, next) => (req.path === '/api/inbound' ? next() : express.json({ limit: '64kb' })(req, res, next)));
app.all(['/api/assistant','/api/channels'], async (req, res) => {
  const handler = req.path === '/api/channels' ? handleChannels : handleAssistant;
  const response = await handler(new Request(new URL(req.originalUrl, 'http://maoki.internal'), { method: req.method, headers: { authorization: req.headers.authorization || '' }, ...(req.method === 'POST' ? { body: JSON.stringify(req.body) } : {}) }));
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.status(response.status).send(await response.text());
});
app.post('/api/messaging', async (req, res) => {
  const response = await handleMessaging(new Request('http://maoki.internal/api/messaging', { method: 'POST', headers: { authorization: req.headers.authorization || '' }, body: JSON.stringify(req.body) }));
  res.status(response.status).send(await response.text());
});
app.post('/api/reviews', async (req, res) => {
  const response = await handleReviews(new Request('http://maoki.internal/api/reviews', { method: 'POST', headers: { authorization: req.headers.authorization || '' }, body: JSON.stringify(req.body) }));
  res.status(response.status).send(await response.text());
});
app.post('/api/youtube', async (req, res) => {
  const response = await handleYouTube(new Request('http://maoki.internal/api/youtube', { method: 'POST', headers: { authorization: req.headers.authorization || '' }, body: JSON.stringify(req.body) }));
  res.status(response.status).send(await response.text());
});
app.all('/api/inbound', express.text({ type: '*/*', limit: '256kb' }), async (req, res) => {
  const headers = new Headers(); for (const name of ['content-type', 'x-zevent-signature', 'x-hub-signature-256']) { const value = req.headers[name]; if (typeof value === 'string') headers.set(name, value); }
  const response = await handleInbound(new Request(new URL(req.originalUrl, 'http://maoki.internal'), { method: req.method, headers }), req.method === 'POST' && typeof req.body === 'string' ? req.body : '');
  res.status(response.status).send(await response.text());
});
app.listen(Number(process.env.AI_PORT || 5001), '127.0.0.1', () => console.log('Maoki Supabase AI API ready'));
