import { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { DirectBooking, GuestGuidebook, VisitorChat } from './PublicPages';

export default function Application() {
  return <BrowserRouter><SessionProvider><Toaster position="top-right" toastOptions={{ style: { fontFamily: 'system-ui, sans-serif', fontSize: '13px', borderRadius: '10px' } }} /><ErrorBoundary><Suspense fallback={<div className="maoki-ui mk-page-loading" role="status"><span className="mk-loading-ring" />Đang tải…</div>}><Routes>
    {['/', '/about', '/features', '/pricing', '/services', '/contact'].map(path => <Route key={path} path={path} element={<Landing />} />)}
    <Route path="/detail/:id" element={<DirectBooking />} />
    <Route path="/admin" element={<Login />} />
    <Route path="/admin/dashboard" element={<WorkspaceGuard><WorkspaceLayout /></WorkspaceGuard>}>
      <Route index element={<Overview />} /><Route path="calendar" element={<Calendar />} /><Route path="messages" element={<Inbox />} /><Route path="reports" element={<Reports />} /><Route path="settings" element={<Settings />} />
      <Route path="properties" element={<ResourcePage resource="properties" />} /><Route path="bookings" element={<ResourcePage resource="bookings" />} /><Route path="contacts" element={<ResourcePage resource="contacts" />} /><Route path="tasks" element={<ResourcePage resource="tasks" />} /><Route path="rates" element={<ResourcePage resource="rates" />} /><Route path="guidebooks" element={<ResourcePage resource="guidebooks" />} /><Route path="owners" element={<ResourcePage resource="owners" />} /><Route path="automations" element={<ResourcePage resource="automations" />} /><Route path="campaigns" element={<ResourcePage resource="campaigns" />} /><Route path="replies" element={<ResourcePage resource="replies" />} /><Route path="channels" element={<ResourcePage resource="integrations" />} /><Route path="hr" element={<ResourcePage resource="employees" />} /><Route path="revenue" element={<ResourcePage resource="revenue" />} />
    </Route>
    <Route path="/book/:id" element={<DirectBooking />} /><Route path="/guide/:token" element={<GuestGuidebook />} /><Route path="/chat/:token" element={<VisitorChat />} />
    <Route path="*" element={<div className="maoki-ui mk-public"><div className="mk-public-card"><h1>Không tìm thấy trang</h1><p>Liên kết có thể đã thay đổi.</p><a className="mk-button primary" href="/admin/dashboard">Về không gian quản lý</a></div></div>} />
  </Routes></Suspense></ErrorBoundary></SessionProvider></BrowserRouter>;
}
