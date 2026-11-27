import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FiCalendar, FiBookmark, FiChevronLeft, FiGrid, FiMessageSquare, FiMenu, FiRefreshCw } from 'react-icons/fi';
import { Capacitor } from '@capacitor/core';
import { useSession } from '../../src/workspace/Session';
import WorkspaceProvider from '../../src/workspace/Provider';
import EditorProvider from '../../src/workspace/Editor';
import { useWorkspace } from '../../src/workspace/context';
import { useAdminTheme } from '../../src/workspace/theme';
import { Button } from '../../src/workspace/ui';
import { usePrefs } from '../../desktop/renderer/prefs';
import { navGroups } from '../../desktop/renderer/Shell';
import type { UiKey } from '../../desktop/renderer/i18n/ui';

const tabs: { to: string; key: UiKey; icon: typeof FiGrid; end?: boolean }[] = [
  { to: '/admin/dashboard', key: 'mb.today', icon: FiGrid, end: true },
  { to: '/admin/dashboard/calendar', key: 'mb.calendar', icon: FiCalendar },
  { to: '/admin/dashboard/messages', key: 'nav.messages', icon: FiMessageSquare },
  { to: '/admin/dashboard/bookings', key: 'nav.bookings', icon: FiBookmark },
  { to: '/admin/dashboard/more', key: 'mb.more', icon: FiMenu },
];

export default function MobileShell() { return <WorkspaceProvider><EditorProvider><Frame /></EditorProvider></WorkspaceProvider>; }

function Frame() {
  const { error, loading, reload, data } = useWorkspace();
  const { t } = usePrefs(); const { resolved } = useAdminTheme(true);
  const location = useLocation(); const navigate = useNavigate(); const { mode } = useSession();
  const segment = location.pathname.split('/').at(-1) || '';
  const section = segment === 'dashboard' ? '' : segment;
  const titleKey = section === 'more' ? 'mb.more' : section === 'calendar' ? 'nav.calendar' : section === 'preferences' ? 'nav.preferences' : navGroups.flatMap(group => group.links).find(link => link[0] === section)?.[1] || 'nav.overview';
  const isRoot = ['', 'calendar', 'messages', 'bookings', 'more'].includes(section);
  const unread = data?.conversations.filter(item => item.unread && item.status !== 'closed').length || 0;

  // Native chrome follows the theme; the Android back button walks the history before closing the app.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void import('@capacitor/status-bar').then(({ StatusBar, Style }) => { void StatusBar.setStyle({ style: resolved === 'dark' ? Style.Dark : Style.Light }); void StatusBar.setBackgroundColor({ color: resolved === 'dark' ? '#171a20' : '#ffffff' }).catch(() => undefined); }).catch(() => undefined);
  }, [resolved]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: { remove: () => Promise<void> } | undefined;
    void import('@capacitor/app').then(async ({ App }) => { handle = await App.addListener('backButton', () => { if (window.history.length > 1 && !isRoot) navigate(-1); else if (!isRoot) navigate('/admin/dashboard'); else void App.exitApp(); }); }).catch(() => undefined);
    return () => { void handle?.remove(); };
  }, [isRoot, navigate]);
  void mode;

  return <div className="maoki-ui mk-zone-admin mb-app">
    <header className="mb-top">
      {isRoot ? <span className="mb-top-spacer" /> : <button className="mk-icon-button" aria-label={t('mb.back')} onClick={() => navigate(-1)}><FiChevronLeft /></button>}
      <h1>{t(titleKey)}</h1>
      <button className="mk-icon-button" aria-label={t('refresh')} onClick={() => void reload()}><FiRefreshCw /></button>
    </header>
    <main id="workspace-main" className="mk-main-content mb-content">
      {error && <div className="mk-alert error" role="alert">{error}<Button onClick={() => void reload()}>{t('retry')}</Button></div>}
      {loading ? <div className="mk-page-loading" role="status"><span className="mk-loading-ring" />{t('opening')}</div> : data ? <Outlet /> : null}
    </main>
    <nav className="mb-tabs" aria-label={t('mainNav')}>
      {tabs.map(({ to, key, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `mb-tab ${isActive ? 'active' : ''}`}><span className="mb-tab-icon"><Icon aria-hidden="true" />{key === 'nav.messages' && unread > 0 && <i className="mb-badge" aria-label={t('unreadN', { n: unread })}>{unread > 9 ? '9+' : unread}</i>}</span><span>{t(key)}</span></NavLink>)}
    </nav>
  </div>;
}

/** "More": every other section of the admin, grouped like the desktop sidebar. */
export function More() {
  const { t } = usePrefs(); const { logout } = useSession(); const navigate = useNavigate(); const { data } = useWorkspace();
  const hidden = new Set(['', 'calendar', 'messages', 'bookings']);
  return <div className="mb-more">
    {navGroups.map((group, index) => {
      const links = group.links.filter(link => !hidden.has(link[0])); if (!links.length) return null;
      return <section key={index}>{group.title && <h2>{t(group.title)}</h2>}<ul>{links.map(([to, key, Icon]) => <li key={to}><Link to={`/admin/dashboard/${to}`}><Icon aria-hidden="true" /><span>{t(key)}</span><FiChevronLeft className="mb-chev" aria-hidden="true" /></Link></li>)}</ul></section>;
    })}
    <section><ul><li><button type="button" onClick={() => void logout().then(() => navigate('/admin'))}>{t('logout')}{data?.settings.businessName ? ` · ${data.settings.businessName}` : ''}</button></li></ul></section>
  </div>;
}
