import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Container } from 'react-bootstrap';
import { AnimatePresence } from 'framer-motion';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import ProtectedRoute from './components/auth/ProtectedRoute';
import ContactPanel from './components/ContactPanel';
import PageTransition from './components/PageTransition';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';
import { Suspense } from 'react';
import * as Pages from './pages';

const AppRoutes = () => {
  const location = useLocation();
  // Dashboard sub-pages share a layout (sidebar/topbar) that must stay
  // mounted across nested navigation — keying by the full pathname would
  // remount it (and re-run its auth check) on every sidebar click, which
  // is what caused "have to click/reload a few times before it shows".
  const routeKey = location.pathname.startsWith('/admin/dashboard')
    ? '/admin/dashboard'
    : location.pathname;

  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<LoadingSpinner />}>
        <PageTransition>
          <Routes location={location} key={routeKey}>
            <Route path="/" element={<Pages.Home />} />
            <Route path="/about" element={<Pages.AboutUs />} />
            <Route path="/features" element={<Pages.Features />} />
            <Route path="/pricing" element={<Pages.Pricing />} />
            <Route path="/services" element={<Pages.Services />} />
            <Route path="/contact" element={<Pages.ContactUs />} />
            <Route path="/detail/:id" element={<Pages.HomestayDetail />} />
            <Route path="/admin" element={<Pages.AdminLogin />} />
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute>
                  <Pages.DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Pages.DashboardOverview />} />
              <Route path="properties" element={<Pages.DashboardProperties />} />
              <Route path="bookings" element={<Pages.DashboardBookings />} />
              <Route path="calendar" element={<Pages.DashboardCalendar />} />
              <Route path="messages" element={<Pages.DashboardMessages />} />
              <Route path="revenue" element={<Pages.DashboardRevenue />} />
              <Route path="hr" element={<Pages.DashboardHR />} />
              <Route path="channels" element={<Pages.DashboardChannels />} />
            </Route>
          </Routes>
        </PageTransition>
      </Suspense>
    </AnimatePresence>
  );
};

function App() {
  return (
    <Router>
      <div className="min-vh-100 d-flex flex-column" style={{ backgroundColor: 'var(--color-background)' }}>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              fontFamily: 'var(--font-body)',
              fontSize: '0.92rem',
              color: 'var(--color-ink)',
              background: 'var(--color-white)',
              border: '1px solid rgba(43, 24, 16, 0.1)',
              borderRadius: '12px',
              boxShadow: '0 12px 30px rgba(43, 24, 16, 0.16)',
              padding: '0.75rem 1rem',
            },
            success: {
              iconTheme: { primary: 'var(--color-gold)', secondary: 'var(--color-white)' },
              style: { borderLeft: '4px solid var(--color-gold)' },
            },
            error: {
              iconTheme: { primary: '#c0392b', secondary: 'var(--color-white)' },
              style: { borderLeft: '4px solid #c0392b' },
            },
            loading: {
              iconTheme: { primary: 'var(--color-primary)', secondary: 'var(--color-white)' },
              style: { borderLeft: '4px solid var(--color-primary)' },
            },
          }}
        />
        <Header />
        <main className="flex-grow-1 py-4">
          <Container>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </Container>
        </main>
        <Footer />
        <ContactPanel />
      </div>
    </Router>
  );
}

export default App;
