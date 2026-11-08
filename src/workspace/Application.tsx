import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from '../components/ErrorBoundary';
import { SessionProvider, WorkspaceGuard } from './Session';
import WorkspaceLayout from './Layout';
import Overview from './Overview';
import Calendar from './Calendar';
import Inbox from './Inbox';
import ResourcePage from './ResourcePage';
import Reports from './Reports';
import Settings from './Settings';
import Login from './Login';
import Landing from './Landing';
import GuestLayout from './guest/GuestLayout';
import { DirectBooking, GuestGuidebook, VisitorChat } from './PublicPages';

const Setup = lazy(() => import('./Setup'));
const Assistant = lazy(() => import('./Assistant'));
const Connections = lazy(() => import('./Connections'));

/** 404 that stays inside the zone the visitor was in. */
function NotFound() {
  const admin = useLocation().pathname.startsWith('/admin');
  return <div className="maoki-ui mk-public"><div className="mk-public-card"><h1>Không tìm thấy trang</h1><p>Liên kết có thể đã thay đổi.</p>
    {admin ? <Link className="mk-button primary" to="/admin/dashboard">Về trang quản trị</Link> : <Link className="mk-button primary" to="/">Về trang chủ MaokiHouse</Link>}
  </div></div>;
}

const resourceRoutes = [['properties', 'properties'], ['bookings', 'bookings'], ['contacts', 'contacts'], ['tasks', 'tasks'], ['rates', 'rates'], ['guidebooks', 'guidebooks'], ['owners', 'owners'], ['automations', 'automations'], ['campaigns', 'campaigns'], ['replies', 'replies'], ['hr', 'employees'], ['revenue', 'revenue']] as const;

export default function Application() {
  return <BrowserRouter><SessionProvider><Toaster position="top-right" toastOptions={{ style: { fontFamily: 'system-ui, sans-serif', fontSize: '13px', borderRadius: '10px' } }} /><ErrorBoundary><Suspense fallback={<div className="maoki-ui mk-page-loading" role="status"><span className="mk-loading-ring" />Đang tải…</div>}><Routes>

    {/* ───────────── KHU VỰC KHÁCH (USER) · công khai, không cần đăng nhập ───────────── */}
    <Route element={<GuestLayout />}>
      <Route path="/" element={<Landing />} />
      <Route path="/book/:id" element={<DirectBooking />} />
      <Route path="/detail/:id" element={<DirectBooking />} />
      <Route path="/guide/:token" element={<GuestGuidebook />} />
    </Route>
    {/* Legacy marketing URLs land on the guest home page. */}
    {['/about', '/features', '/pricing', '/services'].map(path => <Route key={path} path={path} element={<Navigate to="/#stays" replace />} />)}
    <Route path="/contact" element={<Navigate to="/#contact" replace />} />
    {/* Embeddable chat widget: intentionally chrome-less. */}
    <Route path="/chat/:token" element={<VisitorChat />} />

    {/* ───────────── KHU VỰC QUẢN TRỊ (ADMIN) · chủ nhà & đội ngũ, cần đăng nhập ───────────── */}
    <Route path="/admin" element={<Login />} />
    <Route path="/admin/dashboard" element={<WorkspaceGuard><WorkspaceLayout /></WorkspaceGuard>}>
      <Route index element={<Overview />} />
      <Route path="calendar" element={<Calendar />} />
      <Route path="messages" element={<Inbox />} />
      <Route path="reports" element={<Reports />} />
      <Route path="ai" element={<Assistant />} />
      <Route path="settings" element={<Settings />} />
      <Route path="channels" element={<Connections />} />
      {resourceRoutes.map(([path, resource]) => <Route key={path} path={path} element={<ResourcePage resource={resource} />} />)}
    </Route>
    <Route path="/setup" element={<Setup />} />

    <Route path="*" element={<NotFound />} />
  </Routes></Suspense></ErrorBoundary></SessionProvider></BrowserRouter>;
}
