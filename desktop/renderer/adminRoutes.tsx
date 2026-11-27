import { lazy } from 'react';
import { Route } from 'react-router-dom';
import Overview from '../../src/workspace/Overview';
import Calendar from '../../src/workspace/Calendar';
import Inbox from '../../src/workspace/Inbox';
import ResourcePage from '../../src/workspace/ResourcePage';
import Reports from '../../src/workspace/Reports';
import Settings from '../../src/workspace/Settings';
import Preferences from './Preferences';
import Insights from './Insights';
import Handover from './Handover';
import Messaging from './Messaging';
import Reviews from './Reviews';
import YouTube from './YouTube';
import PlanGate from './PlanGate';

const Connections = lazy(() => import('../../src/workspace/Connections'));

const resourceRoutes = [['properties', 'properties'], ['bookings', 'bookings'], ['contacts', 'contacts'], ['tasks', 'tasks'], ['rates', 'rates'], ['guidebooks', 'guidebooks'], ['owners', 'owners'], ['automations', 'automations'], ['campaigns', 'campaigns'], ['replies', 'replies'], ['hr', 'employees'], ['revenue', 'revenue'], ['tags', 'tags'], ['rules', 'rules'], ['hours', 'hours'], ['reminders', 'reminders'], ['ticket-types', 'ticketTypes'], ['tickets', 'tickets'], ['custom-fields', 'customFields'], ['field-values', 'fieldValues'], ['popups', 'popups'], ['products', 'products'], ['orders', 'orders'], ['webhooks', 'webhooks'], ['agent-groups', 'agentGroups'], ['calls', 'calls']] as const;
/** Sections that need the Professional plan (shared inbox channels, bots, journeys). */
const professional = [['bots', 'bots', 'Chatbot kịch bản'], ['journeys', 'journeys', 'Chu trình chăm sóc']] as const;

/** Child routes of /admin/dashboard, shared by the desktop and mobile apps. */
export const adminChildRoutes = <>
  <Route index element={<Overview />} />
  <Route path="calendar" element={<Calendar />} />
  <Route path="messages" element={<Inbox />} />
  <Route path="reports" element={<Reports />} />
  <Route path="insights" element={<Insights />} />
  <Route path="handover" element={<Handover />} />
  <Route path="messaging" element={<PlanGate need="professional" title="Kênh nhắn tin"><Messaging /></PlanGate>} />
  <Route path="reviews" element={<PlanGate need="professional" title="Đánh giá Google"><Reviews /></PlanGate>} />
  <Route path="youtube" element={<PlanGate need="professional" title="Bình luận YouTube"><YouTube /></PlanGate>} />
  <Route path="settings" element={<Settings />} />
  <Route path="preferences" element={<Preferences />} />
  <Route path="channels" element={<PlanGate need="operations" title="Kết nối kênh"><Connections /></PlanGate>} />
  {professional.map(([path, resource, title]) => <Route key={path} path={path} element={<PlanGate need="professional" title={title}><ResourcePage resource={resource} /></PlanGate>} />)}
  {resourceRoutes.map(([path, resource]) => <Route key={path} path={path} element={<ResourcePage resource={resource} />} />)}
</>;
