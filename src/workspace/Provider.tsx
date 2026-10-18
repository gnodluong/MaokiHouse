import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { demoToken } from './demoClient';
import { apiFetch } from '../services/api';
import { requireSupabase, databaseError } from '../lib/supabase/client';
import { useSession } from './Session';
import { WorkspaceContext } from './context';
import type { Values } from './context';
import type { WorkspaceSnapshot, ResourceName } from '../../shared/workspace';

export default function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { mode, user } = useSession();
  const [data, setData] = useState<WorkspaceSnapshot | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const rpc = useCallback(async <T,>(op: string, kind = '', record_id?: string, payload: unknown = {}): Promise<T> => {
    const { data: result, error } = await requireSupabase().rpc('maoki_workspace', { op, kind, record_id: record_id || null, payload });
    if (error) throw databaseError(error); return result as T;
  }, []);
  const request = useCallback(async <T,>(path: string, body?: unknown, method: 'POST' | 'PUT' | 'PATCH' = 'POST'): Promise<T> => {
    if (mode === 'demo') {
      return apiFetch<T>('/workspace' + path, { method, body, idToken: await demoToken() });
    }
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === 'settings') return rpc<T>('settings', '', undefined, body);
    if (parts[0] === 'automations' && parts[2] === 'run') return rpc<T>('run', 'automations', parts[1], { contextId: (body as { bookingId?: string; conversationId?: string })?.bookingId || (body as { conversationId?: string })?.conversationId });
    if (parts[0] === 'conversations' && parts[2] === 'messages') return rpc<T>('message', 'conversations', parts[1], body);
    if (parts[0] === 'workspaces') return rpc<T>(parts[1] || 'workspaces', '', undefined, body);
    if (parts[0] === 'team') return rpc<T>(parts[1] || 'team', '', undefined, body);
    return rpc<T>('save', parts[0], parts[1], body);
  }, [mode, rpc]);
  const reload = useCallback(async () => {
    try {
      if (!user) throw new Error('Phiên đăng nhập đã hết hạn');
      const result = mode === 'supabase' ? await rpc<WorkspaceSnapshot>('snapshot') : await apiFetch<WorkspaceSnapshot>('/workspace', { idToken: await demoToken() });
      if (mode === 'supabase') {
        const blocks = await requireSupabase().rpc('maoki_channels', { op: 'busy' });
        if (blocks.error && blocks.error.code !== 'PGRST202') throw databaseError(blocks.error);
        result.channelBlocks = blocks.data || [];
      }
      setData(result); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được dữ liệu'); }
    finally { setLoading(false); }
  }, [mode, user, rpc]);
  const save = useCallback(async (resource: ResourceName, input: Values, id?: string) => {
    const result = await request<{ warnings?: string[] }>('/' + resource + (id ? '/' + id : ''), input, id ? 'PATCH' : 'POST');
    if (result.warnings?.length) result.warnings.forEach(message => toast.error(message));
    await reload();
  }, [request, reload]);
  const remove = useCallback(async (resource: ResourceName, id: string) => {
    if (mode === 'supabase') await rpc('delete', resource, id);
    else await apiFetch('/workspace/' + resource + '/' + id, { method: 'DELETE', idToken: await demoToken() });
    await reload();
  }, [mode, rpc, reload]);
  useEffect(() => { setData(null); setLoading(true); void reload(); }, [reload]);
  useEffect(() => {
    if (mode !== 'supabase' || !data?.workspaceId) return;
    const client = requireSupabase(); const channel = client.channel('maoki-' + data.workspaceId).on('postgres_changes', { event: '*', schema: 'public', table: 'maoki_records', filter: 'workspace_id=eq.' + data.workspaceId }, () => void reload()).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [mode, data?.workspaceId, reload]);
  // Polling also refreshes settings, audits, and projects with Realtime disabled.
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) void reload(); }, 15000); return () => clearInterval(timer); }, [reload]);
  return <WorkspaceContext.Provider value={{ data, loading, error, reload, save, remove, request }}>{children}</WorkspaceContext.Provider>;
}
