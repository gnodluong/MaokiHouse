import { lazy } from 'react';

export const Home = lazy(() => import('./Home'));
export const AboutUs = lazy(() => import('./AboutUs'));
export const Features = lazy(() => import('./Features'));
export const Pricing = lazy(() => import('./Pricing'));
export const Services = lazy(() => import('./Services'));
export const HomestayDetail = lazy(() => import('./HomestayDetail'));
export const AdminLogin = lazy(() => import('./admin/Login'));
export const ContactUs = lazy(() => import('../components/ContactUs'));

// Dashboard pages are statically imported (not React.lazy) — they sit
// behind auth so initial-bundle size isn't the priority here, and
// lazy-loading them was interacting badly with AnimatePresence's exit/
// enter transition: a chunk suspending mid-animation could leave the
// route tree stuck blank until a manual reload.
export { default as DashboardLayout } from '../components/dashboard/DashboardLayout';
export { default as DashboardOverview } from './dashboard/Overview';
export { default as DashboardProperties } from './dashboard/Properties';
export { default as DashboardBookings } from './dashboard/Bookings';
export { default as DashboardCalendar } from './dashboard/CalendarView';
export { default as DashboardMessages } from './dashboard/Messages';
export { default as DashboardRevenue } from './dashboard/Revenue';
export { default as DashboardHR } from './dashboard/HR';
export { default as DashboardChannels } from './dashboard/Channels';
