import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from '../components/ErrorBoundary';
import Landing from './Landing';
import GuestLayout from './guest/GuestLayout';
import AppDownload from './AppDownload';
import { DirectBooking, GuestGuidebook, VisitorChat } from './PublicPages';

/** 404 for the guest site. */
function NotFound() {
  return <div className="maoki-ui mk-public"><div className="mk-public-card"><h1>Không tìm thấy trang</h1><p>Liên kết có thể đã thay đổi.</p>
    <Link className="mk-button primary" to="/">Về trang chủ MaokiHouse</Link>
  </div></div>;
}

/**
 * Website for guests only. Administration (rooms, bookings, inbox, reports…) is done in the Maoki Admin apps
 * (desktop and mobile), which share the same Supabase project.
 */
export default function Application() {
  return <BrowserRouter><Toaster position="top-right" toastOptions={{ style: { fontFamily: 'system-ui, sans-serif', fontSize: '13px', borderRadius: '10px' } }} /><ErrorBoundary><Suspense fallback={<div className="maoki-ui mk-page-loading" role="status"><span className="mk-loading-ring" />Đang tải…</div>}><Routes>
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
    {/* The staff area moved to the apps. */}
    <Route path="/app" element={<AppDownload />} />
    <Route path="/admin/*" element={<AppDownload />} />
    <Route path="/setup" element={<Navigate to="/app" replace />} />
    <Route path="*" element={<NotFound />} />
  </Routes></Suspense></ErrorBoundary></BrowserRouter>;
}
