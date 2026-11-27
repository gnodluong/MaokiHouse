import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { signOut } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Spinner } from 'react-bootstrap';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '../../config/firebase';
import {
  FaChartLine,
  FaHome,
  FaCalendarCheck,
  FaCalendarAlt,
  FaEnvelope,
  FaMoneyBillWave,
  FaUsers,
  FaPlug,
} from 'react-icons/fa';
import { BiLogOut } from 'react-icons/bi';
import { ConfirmDialogProvider } from './ConfirmDialog';

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: 'Tổng quan', icon: FaChartLine, end: true },
  { to: '/admin/dashboard/properties', label: 'Phòng', icon: FaHome },
  { to: '/admin/dashboard/bookings', label: 'Đặt phòng', icon: FaCalendarCheck },
  { to: '/admin/dashboard/calendar', label: 'Lịch', icon: FaCalendarAlt },
  { to: '/admin/dashboard/messages', label: 'Tin nhắn', icon: FaEnvelope },
  { to: '/admin/dashboard/revenue', label: 'Doanh thu', icon: FaMoneyBillWave },
  { to: '/admin/dashboard/hr', label: 'Nhân sự', icon: FaUsers },
  { to: '/admin/dashboard/channels', label: 'Kênh kết nối', icon: FaPlug },
];

const DashboardLayout = () => {
  const [user] = useAuthState(auth);
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Đã đăng xuất');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Đăng xuất thất bại');
    }
  };

  return (
    <ConfirmDialogProvider>
    <div className="dashboard-shell full-bleed">
      <aside className="dashboard-sidebar">
        <nav className="dashboard-nav">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `dashboard-nav-link${isActive ? ' active' : ''}`}
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="dashboard-topbar-title">Bảng điều khiển</div>
          <div className="dashboard-topbar-user">
            <span className="dashboard-user-email">{user?.email}</span>
            <button type="button" className="dashboard-logout-btn" onClick={handleLogout}>
              <BiLogOut size={18} />
              Đăng xuất
            </button>
          </div>
        </header>
        <main className="dashboard-content">
          <Suspense
            fallback={
              <div className="d-flex justify-content-center align-items-center py-5">
                <Spinner animation="border" style={{ color: 'var(--color-primary)' }} />
              </div>
            }
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeInOut' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </main>
      </div>

      <style>
        {`
          .dashboard-shell {
            min-height: 100vh;
            margin-top: -1.5rem;
            margin-bottom: -1.5rem;
            background: var(--color-cream);
          }

          .dashboard-sidebar {
            position: fixed;
            top: 0;
            left: 0;
            width: 260px;
            height: 100vh;
            z-index: 20;
            overflow-y: auto;
            background-color: #100b09;
            background-image:
              url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%23c9a15a' stroke-width='1' opacity='0.07'%3E%3Cpath d='M60 20c8 8 8 20 0 28-8-8-8-20 0-28z'/%3E%3Cpath d='M60 72c8 8 8 20 0 28-8-8-8-20 0-28z'/%3E%3Cpath d='M20 60c8-8 20-8 28 0-8 8-20 8-28 0z'/%3E%3Cpath d='M72 60c8-8 20-8 28 0-8 8-20 8-28 0z'/%3E%3Ccircle cx='60' cy='60' r='6'/%3E%3Cpath d='M40 40c11 0 20 9 20 20-11 0-20-9-20-20z'/%3E%3Cpath d='M80 40c-11 0-20 9-20 20 11 0 20-9 20-20z'/%3E%3Cpath d='M40 80c11 0 20-9 20-20-11 0-20 9-20 20z'/%3E%3Cpath d='M80 80c-11 0-20-9-20-20 11 0 20 9 20 20z'/%3E%3C/g%3E%3C/svg%3E");
            background-size: 150px 150px;
            background-repeat: repeat;
            color: var(--color-cream);
            display: flex;
            flex-direction: column;
            padding: 1.5rem 1rem;
          }

          .dashboard-nav {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
            padding-top: 4.5rem;
          }

          .dashboard-nav-link {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.7rem 0.9rem;
            border-radius: 10px;
            color: var(--color-cream);
            opacity: 0.75;
            text-decoration: none;
            font-family: var(--font-body);
            font-size: 0.95rem;
            transition: all 0.2s ease;
          }

          .dashboard-nav-link:hover {
            opacity: 1;
            background: rgba(255,255,255,0.06);
          }

          .dashboard-nav-link.active {
            opacity: 1;
            background: rgba(201, 161, 90, 0.16);
            color: var(--color-gold-light);
            box-shadow: inset 3px 0 0 var(--color-gold);
          }

          .dashboard-main {
            margin-left: 260px;
            min-width: 0;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
          }

          .dashboard-topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1.1rem 1.75rem;
            background: var(--color-white, #fff);
            border-bottom: 1px solid rgba(43, 24, 16, 0.08);
            position: sticky;
            top: 0;
            z-index: 5;
          }

          .dashboard-topbar-title {
            font-family: var(--font-display);
            font-size: 1.25rem;
            color: var(--color-ink);
          }

          .dashboard-topbar-user {
            display: flex;
            align-items: center;
            gap: 1rem;
          }

          .dashboard-user-email {
            font-size: 0.9rem;
            color: var(--color-ink);
            opacity: 0.7;
          }

          .dashboard-logout-btn {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            border: none;
            border-radius: 999px;
            padding: 0.5rem 1.1rem;
            background: linear-gradient(135deg, var(--color-gold), var(--color-primary-light));
            color: var(--color-ink);
            font-weight: 600;
            font-size: 0.85rem;
            cursor: pointer;
          }

          .dashboard-content {
            padding: 1.75rem;
            flex: 1;
          }

          @media (max-width: 900px) {
            .dashboard-sidebar {
              position: static;
              width: 100%;
              height: auto;
              flex-direction: row;
              flex-wrap: wrap;
              align-items: center;
            }
            .dashboard-main {
              margin-left: 0;
            }
            .dashboard-nav {
              flex-direction: row;
              flex-wrap: wrap;
              padding-top: 0;
            }
          }
        `}
      </style>
    </div>
    </ConfirmDialogProvider>
  );
};

export default DashboardLayout;
