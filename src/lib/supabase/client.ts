import { createClient } from '@supabase/supabase-js';
import publicConfig from '../../config/supabase.public';

const url = import.meta.env.VITE_SUPABASE_URL || publicConfig.url;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || publicConfig.publishableKey;
export const supabase = url && key ? createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) }) } }) : null;
export function requireSupabase() {
  if (!supabase) throw new Error('Chưa cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY');
  return supabase;
}
export function databaseError(error: { message: string; code?: string }) {
  if (error.code === 'PGRST202' || error.message.includes('maoki_workspace') && error.message.includes('schema cache')) return new Error('Dự án Supabase chưa có cấu trúc MaokiHouse. Hãy áp dụng migration trong thư mục supabase/migrations.');
  return new Error(error.message);
}
