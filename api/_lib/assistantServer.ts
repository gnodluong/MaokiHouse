import 'dotenv/config';
import express from 'express';
import { handleAssistant } from './assistant';

const app = express();
app.use(express.json({ limit: '64kb' }));
app.all('/api/assistant', async (req, res) => {
  const response = await handleAssistant(new Request('http://maoki.internal/api/assistant', { method: req.method, headers: { authorization: req.headers.authorization || '' }, ...(req.method === 'POST' ? { body: JSON.stringify(req.body) } : {}) }));
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.status(response.status).send(await response.text());
});
app.listen(Number(process.env.AI_PORT || 5001), '127.0.0.1', () => console.log('Maoki Supabase AI API ready'));
