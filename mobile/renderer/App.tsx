import { Suspense, lazy, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from '../../src/components/ErrorBoundary';
import { SessionProvider, WorkspaceGuard } from '../../src/workspace/Session';
import { PrefsProvider } from '../../desktop/renderer/prefs';
import Login from '../../desktop/renderer/Login';
import { adminChildRoutes } from '../../desktop/renderer/adminRoutes';
import MobileShell, { More } from './MobileShell';
import '../../src/workspace/workspace.css';
import '../../src/workspace/zones.css';
import '../../desktop/renderer/theme.css';
import './mobile.css';

const Setup = lazy(() => import('../../src/workspace/Setup'));

export default function App() {
  useEffect(() => { document.documentElement.dataset.mkMobile = ''; }, []);
  return <HashRouter><PrefsProvider><SessionProvider>
    <Toaster position="top-center" toastOptions={{ style: { fontSize: '14px', borderRadius: '10px', background: 'var(--mk-surface, #fff)', color: 'var(--mk-ink, #111)', border: '1px solid var(--mk-line, #ddd)' } }} />
    <ErrorBoundary><Suspense fallback={<div className="maoki-ui mk-page-loading" role="status"><span className="mk-loading-ring" /></div>}><Routes>
      <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/admin" element={<Login />} />
      <Route path="/admin/dashboard" element={<WorkspaceGuard><MobileShell /></WorkspaceGuard>}>
        {adminChildRoutes}
        <Route path="more" element={<More />} />
      </Route>
      <Route path="/setup" element={<Setup />} />
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes></Suspense></ErrorBoundary>
  </SessionProvider></PrefsProvider></HashRouter>;
}
