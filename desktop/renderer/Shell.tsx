import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FiGrid, FiHome, FiCalendar, FiBookmark, FiDollarSign, FiClipboard, FiBookOpen, FiUsers, FiMessageSquare, FiZap, FiSend, FiFileText, FiPieChart, FiSettings, FiLink, FiSearch, FiLogOut, FiArrowUpRight, FiRefreshCw, FiCpu, FiBriefcase, FiUserCheck, FiSun, FiMoon, FiSliders, FiTag, FiShuffle, FiWatch, FiBell, FiLifeBuoy, FiTrendingUp, FiRepeat, FiShoppingBag, FiPackage, FiCode, FiLayers, FiEdit3, FiCornerUpRight, FiUsers as FiGroup, FiPhoneCall, FiStar, FiYoutube, FiAlertTriangle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useSession } from '../../src/workspace/Session';
import WorkspaceProvider from '../../src/workspace/Provider';
import EditorProvider from '../../src/workspace/Editor';
import { useWorkspace } from '../../src/workspace/context';
import { initials, errorMessage } from '../../src/workspace/utils';
import { Button, PageGuide } from '../../src/workspace/ui';
import { pageGuides } from '../../src/workspace/guides';
import { useAdminTheme } from '../../src/workspace/theme';
import { channelRequest, isStale, syncConnections } from '../../src/workspace/channelsClient';
import type { CalendarConnection } from '../../src/workspace/channelsClient';
import { definitions } from '../../src/workspace/definitions';
import { usePrefs } from './prefs';
import type { UiKey } from './i18n/ui';

export const navGroups: { title?: UiKey; links: [string, UiKey, typeof FiGrid][] }[] = [
  { links: [['', 'nav.overview', FiGrid]] },
  { title: 'nav.daily', links: [['calendar', 'nav.calendar', FiCalendar], ['bookings', 'nav.bookings', FiBookmark], ['messages', 'nav.messages', FiMessageSquare], ['alerts', 'nav.alerts', FiAlertTriangle], ['tasks', 'nav.tasks', FiClipboard]] },
  { title: 'nav.support', links: [['reminders', 'nav.reminders', FiBell], ['calls', 'nav.calls', FiPhoneCall], ['reviews', 'nav.reviews', FiStar], ['youtube', 'nav.youtube', FiYoutube], ['tickets', 'nav.tickets', FiLifeBuoy], ['ticket-types', 'nav.ticketTypes', FiClipboard], ['insights', 'nav.insights', FiTrendingUp], ['handover', 'nav.handover', FiCornerUpRight]] },
  { title: 'nav.stays', links: [['properties', 'nav.properties', FiHome], ['rates', 'nav.rates', FiDollarSign], ['guidebooks', 'nav.guidebooks', FiBookOpen]] },
  { title: 'nav.guests', links: [['contacts', 'nav.contacts', FiUsers], ['replies', 'nav.replies', FiFileText], ['automations', 'nav.automations', FiZap], ['custom-fields', 'nav.customFields', FiEdit3], ['field-values', 'nav.fieldValues', FiLayers], ['campaigns', 'nav.campaigns', FiSend], ['popups', 'nav.popups', FiLayers], ['bots', 'nav.bots', FiCpu], ['journeys', 'nav.journeys', FiRepeat]] },
  { title: 'nav.sales', links: [['products', 'nav.products', FiPackage], ['orders', 'nav.orders', FiShoppingBag]] },
  { title: 'nav.business', links: [['revenue', 'nav.revenue', FiDollarSign], ['reports', 'nav.reports', FiPieChart], ['owners', 'nav.owners', FiBriefcase], ['hr', 'nav.hr', FiUserCheck], ['agent-groups', 'nav.agentGroups', FiGroup]] },
  { title: 'nav.setup', links: [['tags', 'nav.tags', FiTag], ['rules', 'nav.rules', FiShuffle], ['hours', 'nav.hours', FiWatch], ['channels', 'nav.channels', FiLink], ['messaging', 'nav.messaging', FiMessageSquare], ['webhooks', 'nav.webhooks', FiCode], ['settings', 'nav.settings', FiSettings], ['preferences', 'nav.preferences', FiSliders]] },
];

export const NOTIFY_KEY = 'maoki:desktop-notify';
export const notificationsEnabled = () => { try { return window.localStorage.getItem(NOTIFY_KEY) !== 'off'; } catch { return true; } };

export default function Shell() { return <WorkspaceProvider><EditorProvider><Frame /></EditorProvider></WorkspaceProvider>; }

function Frame() {
  const { user, mode, logout } = useSession();
  const { data, loading, error, reload, request } = useWorkspace();
  const { t, lang, setLang } = usePrefs();
  const { resolved: theme, setPreference: setTheme } = useAdminTheme(true);
  const location = useLocation(); const navigate = useNavigate();
  const [query, setQuery] = useState(''); const searchRef = useRef<HTMLInputElement>(null);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string; current: boolean }[]>([]);
  const role = data?.capabilities.role;

  useEffect(() => { if (mode === 'supabase' && data?.workspaceId) void request<{ id: string; name: string; current: boolean }[]>('/workspaces').then(setWorkspaces).catch(() => { /* the banner reports connection errors */ }); }, [mode, data?.workspaceId, request]);
  // Pull channel calendars older than an hour once per app launch (owners and managers only).
  useEffect(() => {
    if (mode !== 'supabase' || !role || !['owner', 'manager'].includes(role)) return;
    try { if (window.sessionStorage.getItem('maoki:calendar-autosync') === '1') return; window.sessionStorage.setItem('maoki:calendar-autosync', '1'); } catch { /* run once anyway */ }
    void channelRequest<{ connections: CalendarConnection[] }>().then(async ({ connections }) => {
      const stale = connections.filter(connection => isStale(connection)).slice(0, 15);
      if (!stale.length) return;
      const { ok } = await syncConnections(stale);
      if (ok) { await reload(); toast.success(t('calendarsSynced', { n: ok })); }
    }).catch(() => { /* Channel connections shows sync errors in detail */ });
  }, [mode, role, reload, t]);
  // Native desktop notification when a new unread conversation arrives (not for the conversations present at launch).
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const unreadIds = data.conversations.filter(item => item.unread && item.status !== 'closed');
    if (seen.current && notificationsEnabled() && 'Notification' in window && Notification.permission !== 'denied') {
      for (const item of unreadIds.filter(entry => !seen.current!.has(entry.id))) { try { const last = item.messages.at(-1); new Notification(item.guestName, { body: last?.text || '', silent: false }); } catch { /* notifications unavailable */ } }
    }
    seen.current = new Set(unreadIds.map(item => item.id));
  }, [data]);
  useEffect(() => setQuery(''), [location.pathname]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'Escape') setQuery('');
    };
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler);
  }, []);

  const unread = data?.conversations.filter(item => item.unread && item.status !== 'closed').length || 0;
  const segment = location.pathname.split('/').at(-1) || '';
  const routeKey = segment === 'dashboard' ? '' : segment;
  const current = navGroups.flatMap(group => group.links).find(link => link[0] === routeKey);
  const guide = pageGuides[routeKey];
  const records = data ? (['properties', 'bookings', 'contacts', 'tasks', 'guidebooks'] as const).flatMap(resource => data[resource].map(record => ({ label: 'title' in record ? record.title : 'guestName' in record ? record.guestName : record.name, type: definitions[resource].title, path: `/admin/dashboard/${resource}?edit=${record.id}` }))) : [];
  const needle = query.trim().toLocaleLowerCase();
  const matches = needle ? records.filter(item => item.label.toLocaleLowerCase().includes(needle)).slice(0, 8) : [];
  const name = user?.name || user?.email?.split('@')[0] || t('role.member');
  const roleKey = (`role.${role || 'member'}`) as UiKey;

  return <div className="maoki-ui mk-zone-admin dk-app">
    <a className="mk-skip" href="#workspace-main">{t('skip')}</a>
    <aside className="dk-sidebar" aria-label={t('mainNav')}>
      <Link className="dk-brand" to="/admin/dashboard"><span className="dk-wordmark" role="img" aria-label="Maoki House" /><small>Admin</small></Link>
      {workspaces.length > 1 && <label className="dk-workspace"><span className="mk-sr">{t('switchWorkspace')}</span><select value={data?.workspaceId || ''} onChange={event => { void request('/workspaces/switch', { id: event.target.value }).then(reload).catch(cause => toast.error(errorMessage(cause))); }}>{workspaces.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
      <nav>{navGroups.map((group, index) => <div className="dk-nav-group" key={index}>{group.title && <span className="dk-nav-heading">{t(group.title)}</span>}{group.links.map(([to, key, Icon]) => <NavLink key={to || 'home'} to={'/admin/dashboard' + (to ? '/' + to : '')} end={to === ''} className={({ isActive }) => `dk-nav-link ${isActive ? 'active' : ''}`}><Icon aria-hidden="true" /><span>{t(key)}</span>{to === 'messages' && unread > 0 && <span className="dk-count" aria-label={t('unreadN', { n: unread })}>{unread}</span>}</NavLink>)}</div>)}</nav>
      <div className="dk-person"><span className="mk-avatar small" aria-hidden="true">{initials(user?.name || user?.email || 'Maoki House')}</span><div><strong>{name}</strong><small title={user?.email || undefined}>{t(roleKey)}</small></div><button className="mk-icon-button" aria-label={t('logout')} title={t('logout')} onClick={() => void logout().then(() => navigate('/admin')).catch(cause => toast.error(errorMessage(cause)))}><FiLogOut /></button></div>
    </aside>
    <div className="dk-main">
      <header className="dk-topbar">
        <div className="dk-crumb"><span>{t('admin')}</span><span aria-hidden="true">/</span><strong>{t(current?.[1] || (routeKey === 'preferences' ? 'nav.preferences' : 'nav.overview'))}</strong></div>
        <div className="dk-search"><label><FiSearch aria-hidden="true" /><input ref={searchRef} aria-label={t('searchLabel')} placeholder={t('searchPlaceholder')} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && matches[0]) { navigate(matches[0].path); setQuery(''); } }} /><kbd>Ctrl K</kbd></label>
          {query && <div className="mk-search-results" role="region" aria-label={t('searchResults')}>{matches.length ? matches.map(item => <Link key={item.path} to={item.path} onClick={() => setQuery('')}><FiSearch aria-hidden="true" /><span>{item.label}<small>{item.type}</small></span><FiArrowUpRight aria-hidden="true" /></Link>) : <p>{t('noResults')}</p>}</div>}</div>
        <div className="dk-tools">
          <div className="dk-lang" role="group" aria-label={t('language')}>{(['vi', 'en'] as const).map(code => <button key={code} type="button" className={lang === code ? 'on' : ''} aria-pressed={lang === code} onClick={() => setLang(code)}>{code.toUpperCase()}</button>)}</div>
          <button className="mk-icon-button" aria-label={theme === 'dark' ? t('themeToLight') : t('themeToDark')} title={theme === 'dark' ? t('themeToLight') : t('themeToDark')} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <FiSun /> : <FiMoon />}</button>
          <button className="mk-icon-button" aria-label={t('refresh')} title={t('refresh')} onClick={() => void reload()}><FiRefreshCw /></button>
          <Link className="dk-inbox mk-icon-button" to="/admin/dashboard/messages" aria-label={`${t('inbox')}, ${t('unreadN', { n: unread })}`} title={t('inbox')}><FiMessageSquare />{unread > 0 && <i />}</Link>
        </div>
      </header>
      <main id="workspace-main" tabIndex={-1} className="mk-main-content dk-content">
        {error && <div className="mk-alert error" role="alert">{error}<Link className="mk-subtle-link" to="/setup">{t('setupGuide')}</Link><Button onClick={() => void reload()}>{t('retry')}</Button></div>}
        {loading ? <div className="mk-page-loading" role="status"><span className="mk-loading-ring" />{t('opening')}</div> : data ? <><Outlet />{guide && <PageGuide key={routeKey} id={routeKey} guide={guide} />}</> : null}
      </main>
    </div>
  </div>;
}
