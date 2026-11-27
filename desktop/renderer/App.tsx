import { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from '../../src/components/ErrorBoundary';
import { SessionProvider, WorkspaceGuard } from '../../src/workspace/Session';
import { PrefsProvider } from './prefs';
import Shell from './Shell';
import Login from './Login';
import { adminChildRoutes } from './adminRoutes';
import '../../src/workspace/workspace.css';
import '../../src/workspace/zones.css';
import './theme.css';

const Setup = lazy(() => import('../../src/workspace/Setup'));

export default function App() {
  return <HashRouter><PrefsProvider><SessionProvider>
    <Toaster position="bottom-right" toastOptions={{ style: { fontSize: '13px', borderRadius: '8px', background: 'var(--mk-surface, #fff)', color: 'var(--mk-ink, #111)', border: '1px solid var(--mk-line, #ddd)' } }} />
    <ErrorBoundary><Suspense fallback={<div className="maoki-ui mk-page-loading" role="status"><span className="mk-loading-ring" /></div>}><Routes>
      <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/admin" element={<Login />} />
      <Route path="/admin/dashboard" element={<WorkspaceGuard><Shell /></WorkspaceGuard>}>{adminChildRoutes}</Route>
      <Route path="/setup" element={<Setup />} />
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes></Suspense></ErrorBoundary>
  </SessionProvider></PrefsProvider></HashRouter>;
}
