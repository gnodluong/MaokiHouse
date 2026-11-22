import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from '../../src/components/ErrorBoundary';
import { SessionProvider, WorkspaceGuard } from '../../src/workspace/Session';
import Overview from '../../src/workspace/Overview';
import Calendar from '../../src/workspace/Calendar';
import Inbox from '../../src/workspace/Inbox';
import ResourcePage from '../../src/workspace/ResourcePage';
import Reports from '../../src/workspace/Reports';
import Settings from '../../src/workspace/Settings';
import { PrefsProvider } from './prefs';
import Shell from './Shell';
import Login from './Login';
import Preferences from './Preferences';
import '../../src/workspace/workspace.css';
import '../../src/workspace/zones.css';
import './theme.css';

const Setup = lazy(() => import('../../src/workspace/Setup'));
const Assistant = lazy(() => import('../../src/workspace/Assistant'));
const Connections = lazy(() => import('../../src/workspace/Connections'));
const resourceRoutes = [['properties', 'properties'], ['bookings', 'bookings'], ['contacts', 'contacts'], ['tasks', 'tasks'], ['rates', 'rates'], ['guidebooks', 'guidebooks'], ['owners', 'owners'], ['automations', 'automations'], ['campaigns', 'campaigns'], ['replies', 'replies'], ['hr', 'employees'], ['revenue', 'revenue']] as const;

export default function App() {
  return <HashRouter><PrefsProvider><SessionProvider>
    <Toaster position="bottom-right" toastOptions={{ style: { fontSize: '13px', borderRadius: '8px', background: 'var(--mk-surface, #fff)', color: 'var(--mk-ink, #111)', border: '1px solid var(--mk-line, #ddd)' } }} />
    <ErrorBoundary><Suspense fallback={<div className="maoki-ui mk-page-loading" role="status"><span className="mk-loading-ring" /></div>}><Routes>
      <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/admin" element={<Login />} />
      <Route path="/admin/dashboard" element={<WorkspaceGuard><Shell /></WorkspaceGuard>}>
        <Route index element={<Overview />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="messages" element={<Inbox />} />
        <Route path="reports" element={<Reports />} />
        <Route path="ai" element={<Assistant />} />
        <Route path="settings" element={<Settings />} />
        <Route path="preferences" element={<Preferences />} />
        <Route path="channels" element={<Connections />} />
        {resourceRoutes.map(([path, resource]) => <Route key={path} path={path} element={<ResourcePage resource={resource} />} />)}
      </Route>
      <Route path="/setup" element={<Setup />} />
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes></Suspense></ErrorBoundary>
  </SessionProvider></PrefsProvider></HashRouter>;
}
