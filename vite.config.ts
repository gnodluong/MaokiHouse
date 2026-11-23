import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()], base: '/', server: { proxy: { '/api/assistant': 'http://127.0.0.1:5001', '/api/channels': 'http://127.0.0.1:5001', '/api/messaging': 'http://127.0.0.1:5001', '/api/inbound': 'http://127.0.0.1:5001', '/api/reviews': 'http://127.0.0.1:5001', '/api/youtube': 'http://127.0.0.1:5001' } } });
