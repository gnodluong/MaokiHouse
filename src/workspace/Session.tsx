import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { demoEnabled, getDemoAuth } from './demoClient';
import { requireSupabase, supabase } from '../lib/supabase/client';
import { apiFetch } from '../services/api';

type Mode = 'supabase' | 'demo';
interface Identity { id: string; email: string; name: string }
interface SessionValue { user: Identity | null; mode: Mode; loading: boolean; demoAvailable: boolean; startDemo: () => Promise<void>; logout: () => Promise<void>; selectPrimary: () => void }
const SessionContext = createContext<SessionValue | null>(null);
const savedMode = (): Mode => { try { return localStorage.getItem('maoki-backend') === 'demo' && demoEnabled ? 'demo' : 'supabase'; } catch { return 'supabase'; } };
export function SessionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(savedMode); const [user, setUser] = useState<Identity | null>(null); const [loading, setLoading] = useState(true);
  const changeMode = (value: Mode) => { try { localStorage.setItem('maoki-backend', value); } catch { /* Session still works in memory. */ } setMode(value); };
  useEffect(() => {
    setLoading(true); setUser(null);
    if (mode === 'demo') {
      let active = true; let unsubscribe: (() => void) | undefined;
      void Promise.all([getDemoAuth(), import('firebase/auth')]).then(([auth, { onAuthStateChanged }]) => {
        if (active) unsubscribe = onAuthStateChanged(auth, current => { setUser(current ? { id: current.uid, email: '', name: 'Không gian demo' } : null); setLoading(false); });
      }).catch(() => { if (active) setLoading(false); });
      return () => { active = false; unsubscribe?.(); };
    }
    if (!supabase) { setLoading(false); return; }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (active) { const current = session?.user; setUser(current ? { id: current.id, email: current.email || '', name: current.email?.split('@')[0] || 'Chủ nhà' } : null); setLoading(false); } });
    void supabase.auth.getSession().then(({ data, error }) => { if (active) { const current = error ? null : data.session?.user; setUser(current ? { id: current.id, email: current.email || '', name: current.email?.split('@')[0] || 'Chủ nhà' } : null); setLoading(false); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, [mode]);
  const startDemo = async () => {
    const auth = await getDemoAuth(); const { signInAnonymously } = await import('firebase/auth');
    if (!auth.currentUser?.isAnonymous) await signInAnonymously(auth);
    await apiFetch('/workspace/demo', { method: 'POST', idToken: await auth.currentUser!.getIdToken() });
    await auth.currentUser!.getIdToken(true); changeMode('demo');
    setUser({ id: auth.currentUser!.uid, email: '', name: 'Không gian demo' });
  };
  const logout = async () => { if (mode === 'demo') { const { signOut } = await import('firebase/auth'); await signOut(await getDemoAuth()); } else { const { error } = await requireSupabase().auth.signOut(); if (error) throw error; } setUser(null); };
  return <SessionContext.Provider value={{ user, mode, loading, demoAvailable: demoEnabled, startDemo, logout, selectPrimary: () => changeMode('supabase') }}>{children}</SessionContext.Provider>;
}
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error('Session provider is required'); return value; }
export function WorkspaceGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useSession(); const location = useLocation();
  if (loading) return <div className="maoki-ui mk-page-loading" role="status">Đang kiểm tra phiên đăng nhập…</div>;
  return user ? children : <Navigate to="/admin" replace state={{ from: location.pathname }} />;
}
