import Brand from './Brand';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FiGrid, FiHome, FiCalendar, FiBookmark, FiDollarSign, FiClipboard, FiBookOpen, FiUsers, FiMessageSquare, FiZap, FiSend, FiFileText, FiPieChart, FiSettings, FiLink, FiSearch, FiMenu, FiX, FiLogOut, FiArrowUpRight, FiRefreshCw, FiPlusCircle, FiCpu, FiBriefcase, FiUserCheck, FiSun, FiMoon } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useSession } from './Session';
import WorkspaceProvider from './Provider';
import EditorProvider from './Editor';
import { useWorkspace } from './context';
import { initials, errorMessage } from './utils';
import { Button, PageGuide } from './ui';
import { pageGuides } from './guides';
import { useAdminTheme } from './theme';
import { channelRequest, isStale, syncConnections } from './channelsClient';
import type { CalendarConnection } from './channelsClient';
import { definitions } from './definitions';
import './workspace.css';
import './zones.css';

const roleLabels: Record<string, string> = { owner: 'Chủ không gian', manager: 'Quản lý', agent: 'Nhân viên', viewer: 'Chỉ xem' };
const groups = [
  { title: '', links: [['', 'Tổng quan', FiGrid]] },
  { title: 'Hằng ngày', links: [['calendar', 'Lịch phòng', FiCalendar], ['bookings', 'Đặt phòng', FiBookmark], ['messages', 'Hộp thư', FiMessageSquare], ['tasks', 'Công việc', FiClipboard]] },
  { title: 'Phòng & giá', links: [['properties', 'Phòng & căn hộ', FiHome], ['rates', 'Giá & tình trạng', FiDollarSign], ['guidebooks', 'Sổ tay lưu trú', FiBookOpen]] },
  { title: 'Khách hàng', links: [['contacts', 'Khách hàng', FiUsers], ['replies', 'Mẫu trả lời', FiFileText], ['automations', 'Tự động hóa', FiZap], ['campaigns', 'Chiến dịch', FiSend]] },
  { title: 'Kinh doanh', links: [['revenue', 'Thu & chi', FiDollarSign], ['reports', 'Báo cáo', FiPieChart], ['owners', 'Chủ sở hữu', FiBriefcase], ['hr', 'Đội ngũ', FiUserCheck]] },
  { title: 'Thiết lập', links: [['channels', 'Kết nối kênh', FiLink], ['ai', 'Trợ lý AI', FiCpu], ['settings', 'Cài đặt', FiSettings]] },
] as const;
export default function WorkspaceLayout() { return <WorkspaceProvider><EditorProvider><Shell /></EditorProvider></WorkspaceProvider>; }

function Shell() {
  const { user, mode, logout } = useSession();
  const { data, loading, error, reload, request } = useWorkspace();
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string; current: boolean }[]>([]);
  useEffect(() => { if (mode === 'supabase' && data?.workspaceId) void request<{ id: string; name: string; current: boolean }[]>('/workspaces').then(setWorkspaces).catch(() => { /* The workspace banner reports connection errors. */ }); }, [mode, data?.workspaceId, request]);
  const [drawer, setDrawer] = useState(false); const [query, setQuery] = useState(''); const [busy, setBusy] = useState(false);
  const { resolved: theme, setPreference: setTheme } = useAdminTheme();
  // Background calendar refresh: once per browser session, owners/managers pull channel feeds older than an hour.
  const role = data?.capabilities.role;
  useEffect(() => {
    if (mode !== 'supabase' || !role || !['owner', 'manager'].includes(role)) return;
    try { if (window.sessionStorage.getItem('maoki:calendar-autosync') === '1') return; window.sessionStorage.setItem('maoki:calendar-autosync', '1'); } catch { /* still run once */ }
    void channelRequest<{ connections: CalendarConnection[] }>().then(async ({ connections }) => {
      const stale = connections.filter(connection => isStale(connection)).slice(0, 15);
      if (!stale.length) return;
      const { ok } = await syncConnections(stale);
      if (ok) { await reload(); toast.success(`Đã cập nhật lịch từ ${ok} kết nối kênh`); }
    }).catch(() => { /* Kết nối kênh shows sync errors in detail. */ });
  }, [mode, role, reload]);
  const location = useLocation(); const navigate = useNavigate(); const searchRef = useRef<HTMLInputElement>(null); const menuRef = useRef<HTMLButtonElement>(null); const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => { setDrawer(false); setQuery(''); }, [location.pathname]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'Escape') { setQuery(''); setDrawer(false); menuRef.current?.focus(); }
    };
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    if (!drawer) return;
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector<HTMLElement>('button,a')?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a,button') || []); const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', trap); };
  }, [drawer]);
  const unread = data?.conversations.filter(item => item.unread && item.status !== 'closed').length || 0;
  const path = location.pathname.split('/').at(-1) || '';
  const current = groups.flatMap(group => [...group.links]).find(link => link[0] === (path === 'dashboard' ? '' : path));
  const resources = data ? (['properties', 'bookings', 'contacts', 'tasks', 'guidebooks'] as const).flatMap(resource => data[resource].map(record => ({ label: 'title' in record ? record.title : 'guestName' in record ? record.guestName : record.name, type: definitions[resource].title, path: `/admin/dashboard/${resource}?edit=${record.id}` }))) : [];
  const matches = query.trim() ? resources.filter(item => item.label.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))).slice(0, 8) : [];
  const seed = async () => { setBusy(true); try { const result = await request<{ seeded: boolean }>('/seed'); await reload(); toast.success(result.seeded ? 'Không gian mẫu đã sẵn sàng' : 'Không gian đã có dữ liệu, không thêm bản mẫu'); } catch (cause) { toast.error(errorMessage(cause)); } finally { setBusy(false); } };
  const routeKey = path === 'dashboard' ? '' : path;
  const guide = pageGuides[routeKey];
  return <div className="maoki-ui mk-zone-admin mk-app"><a className="mk-skip" href="#workspace-main">Đến nội dung chính</a>{drawer && <button className="mk-drawer-backdrop" aria-label="Đóng điều hướng" onClick={() => setDrawer(false)} />}
    <aside className={`mk-sidebar ${drawer ? 'is-open' : ''}`} ref={sidebarRef} aria-label="Điều hướng chính">
      <div className="mk-admin-sidebar-brand"><Brand to="/admin/dashboard" tagline="" /><button className="mk-icon-button mk-mobile-close" aria-label="Đóng menu" onClick={() => { setDrawer(false); menuRef.current?.focus(); }}><FiX /></button></div>
      <div className="mk-workspace-label"><span className="mk-business-avatar" aria-hidden="true">{initials(data?.settings.businessName || 'MaokiHouse').slice(0, 1)}</span><div><strong>{data?.settings.businessName || 'MaokiHouse'}</strong><small>{mode === 'demo' ? 'Không gian demo' : roleLabels[role || ''] || 'Thành viên'}</small>{workspaces.length > 1 && <select aria-label="Chuyển không gian" value={data?.workspaceId || ''} onChange={event => { void request('/workspaces/switch', { id: event.target.value }).then(reload).catch(cause => toast.error(errorMessage(cause))); }}>{workspaces.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select>}</div></div>
      <nav>{groups.map(group => <div className="mk-nav-group" key={group.title || 'home'}>{group.title && <span className="mk-nav-heading">{group.title}</span>}{group.links.map(([to, title, Icon]) => <NavLink key={to} to={'/admin/dashboard' + (to ? '/' + to : '')} end={to === ''} className={({ isActive }) => `mk-nav-link ${isActive ? 'active' : ''}`}><Icon aria-hidden="true" /><span>{title}</span>{to === 'messages' && unread > 0 && <span className="mk-unread-count" aria-label={`${unread} chưa đọc`}>{unread}</span>}</NavLink>)}</div>)}</nav>
      <div className="mk-sidebar-footer"><Link to={data?.capabilities.localDemo ? '/?demo=1' : '/'} target="_blank" rel="noreferrer"><FiArrowUpRight aria-hidden="true" />Xem website khách</Link><div className="mk-sidebar-person"><span className="mk-avatar small" aria-hidden="true">{initials(user?.name || user?.email || 'Maoki House')}</span><div><strong>{user?.name || user?.email?.split('@')[0] || 'Thành viên'}</strong><small>{user?.email || 'Dữ liệu dùng thử'}</small></div><button className="mk-icon-button" aria-label="Đăng xuất" title="Đăng xuất" onClick={() => void logout().then(() => navigate('/admin')).catch(cause => toast.error(errorMessage(cause)))}><FiLogOut /></button></div></div>
    </aside>
    <div className="mk-app-main"><header className="mk-topbar"><button ref={menuRef} className="mk-icon-button mk-menu-toggle" aria-label="Mở menu" aria-expanded={drawer} onClick={() => setDrawer(true)}><FiMenu /></button><div className="mk-breadcrumb"><span>Quản trị</span><span aria-hidden="true">/</span><strong>{current?.[1] || 'Tổng quan'}</strong></div><div className="mk-global-search"><label><FiSearch aria-hidden="true" /><input ref={searchRef} aria-label="Tìm trong không gian" placeholder="Tìm khách, đặt phòng, công việc…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && matches[0]) { navigate(matches[0].path); setQuery(''); } }} /><kbd>Ctrl K</kbd></label>{query && <div className="mk-search-results" role="region" aria-label="Kết quả tìm kiếm">{matches.length ? matches.map(item => <Link key={item.path} to={item.path} onClick={() => setQuery('')}><FiSearch aria-hidden="true" /><span>{item.label}<small>{item.type}</small></span><FiArrowUpRight aria-hidden="true" /></Link>) : <p>Không tìm thấy kết quả phù hợp.</p>}</div>}</div><div className="mk-topbar-right">{data?.capabilities.localDemo && <span className="mk-demo-badge"><span />Môi trường demo</span>}<button className="mk-icon-button" aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} title={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <FiSun /> : <FiMoon />}</button><button className="mk-icon-button" aria-label="Làm mới dữ liệu" title="Làm mới dữ liệu" onClick={() => void reload()}><FiRefreshCw /></button><Link className="mk-inbox-shortcut mk-icon-button" to="/admin/dashboard/messages" aria-label={`Hộp thư, ${unread} chưa đọc`} title="Hộp thư"><FiMessageSquare />{unread > 0 && <i />}</Link></div></header>
      <main id="workspace-main" tabIndex={-1} className="mk-main-content">{error && <div className="mk-alert error" role="alert">{error}<Link className="mk-subtle-link" to="/setup">Hướng dẫn thiết lập Supabase</Link><Button onClick={() => void reload()}>Thử lại</Button></div>}{loading ? <div className="mk-page-loading" role="status"><span className="mk-loading-ring" />Đang mở không gian của bạn…</div> : data ? <>{data.capabilities.localDemo && !data.properties.length && !data.contacts.length && <div className="mk-welcome-banner"><div><strong>Chào mừng đến không gian của bạn</strong><p>Khám phá toàn bộ quy trình với dữ liệu mẫu hoặc bắt đầu bằng bản ghi đầu tiên.</p></div><Button busy={busy} onClick={() => void seed()}><FiPlusCircle />Tạo dữ liệu mẫu</Button></div>}<Outlet />{guide && <PageGuide key={routeKey} id={routeKey} guide={guide} />}</> : null}</main>
    </div>
  </div>;
}
