import Brand from './Brand';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FiGrid, FiHome, FiCalendar, FiBookmark, FiDollarSign, FiClipboard, FiBookOpen, FiUsers, FiMessageSquare, FiZap, FiSend, FiFileText, FiPieChart, FiSettings, FiLink, FiSearch, FiMenu, FiX, FiLogOut, FiChevronRight, FiArrowUpRight, FiRefreshCw, FiPlusCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useSession } from './Session';
import WorkspaceProvider from './Provider';
import EditorProvider from './Editor';
import { useWorkspace } from './context';
import { initials, errorMessage } from './utils';
import { Button } from './ui';
import { definitions } from './definitions';
import './workspace.css';

const groups = [
  { title: 'ĐIỀU HÀNH', links: [ ['','Tổng quan',FiGrid], ['calendar','Lịch phòng',FiCalendar], ['bookings','Đặt phòng',FiBookmark], ['properties','Phòng & căn hộ',FiHome], ['rates','Giá & tình trạng',FiDollarSign], ['tasks','Công việc',FiClipboard], ['guidebooks','Sổ tay lưu trú',FiBookOpen] ] },
  { title: 'KHÁCH HÀNG & SOCIAL', links: [ ['messages','Hộp thư hợp nhất',FiMessageSquare], ['contacts','Khách hàng',FiUsers], ['automations','Tự động hóa',FiZap], ['campaigns','Chiến dịch',FiSend], ['replies','Mẫu trả lời',FiFileText], ['ai','Trợ lý AI',FiZap] ] },
  { title: 'KINH DOANH', links: [ ['revenue','Thu & chi',FiDollarSign], ['reports','Báo cáo',FiPieChart], ['owners','Chủ sở hữu',FiUsers], ['hr','Đội ngũ',FiUsers], ['channels','Kết nối',FiLink], ['settings','Cài đặt',FiSettings] ] },
] as const;
export default function WorkspaceLayout() { return <WorkspaceProvider><EditorProvider><Shell /></EditorProvider></WorkspaceProvider>; }

function Shell() {
  const { user, mode, logout } = useSession();
  const { data, loading, error, reload, request } = useWorkspace();
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string; current: boolean }[]>([]);
  useEffect(() => { if (mode === 'supabase' && data?.workspaceId) void request<{ id: string; name: string; current: boolean }[]>('/workspaces').then(setWorkspaces).catch(() => { /* The workspace banner reports connection errors. */ }); }, [mode, data?.workspaceId, request]);
  const [drawer, setDrawer] = useState(false); const [query, setQuery] = useState(''); const [busy, setBusy] = useState(false);
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
  return <div className="maoki-ui mk-app"><a className="mk-skip" href="#workspace-main">Đến nội dung chính</a>{drawer && <button className="mk-drawer-backdrop" aria-label="Đóng điều hướng" onClick={() => setDrawer(false)} />}
    <aside className={`mk-sidebar ${drawer ? 'is-open' : ''}`} ref={sidebarRef} aria-label="Điều hướng chính"><Brand to="/admin/dashboard" tagline="HOSPITALITY WORKSPACE" /><button className="mk-icon-button mk-mobile-close" aria-label="Đóng menu" onClick={() => { setDrawer(false); menuRef.current?.focus(); }}><FiX /></button>
      <div className="mk-workspace-label"><span className="mk-business-avatar">M</span><div><strong>{data?.settings.businessName || 'MaokiHouse'}</strong><small>Không gian quản lý</small>{workspaces.length > 1 && <select aria-label="Chuyển không gian" value={data?.workspaceId || ''} onChange={event => { void request('/workspaces/switch', { id: event.target.value }).then(reload).catch(cause => toast.error(errorMessage(cause))); }}>{workspaces.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select>}</div></div>
      <nav>{groups.map(group => <div className="mk-nav-group" key={group.title}><span className="mk-nav-heading">{group.title}</span>{group.links.map(([to, title, Icon]) => <NavLink key={to} to={'/admin/dashboard' + (to ? '/' + to : '')} end={to === ''} className={({ isActive }) => `mk-nav-link ${isActive ? 'active' : ''}`}><Icon aria-hidden="true" /><span>{title}</span>{to === 'messages' && unread > 0 && <span className="mk-unread-count">{unread}</span>}</NavLink>)}</div>)}</nav>
      <div className="mk-sidebar-footer"><Link to={data?.capabilities.localDemo ? '/?demo=1' : '/'} target="_blank" rel="noreferrer"><FiArrowUpRight />Xem website MaokiHouse</Link><div className="mk-sidebar-person"><span className="mk-avatar small">{initials(user?.name || user?.email || 'Maoki House')}</span><div><strong>{mode === 'demo' ? 'Không gian demo' : 'Chủ nhà'}</strong><small>{user?.email || 'Dữ liệu dùng thử'}</small></div><button className="mk-icon-button" aria-label="Đăng xuất" onClick={() => void logout().then(() => navigate('/admin')).catch(cause => toast.error(errorMessage(cause)))}><FiLogOut /></button></div></div>
    </aside>
    <div className="mk-app-main"><header className="mk-topbar"><button ref={menuRef} className="mk-icon-button mk-menu-toggle" aria-label="Mở menu" aria-expanded={drawer} onClick={() => setDrawer(true)}><FiMenu /></button><div className="mk-breadcrumb">Không gian làm việc<FiChevronRight /><strong>{current?.[1] || 'Tổng quan'}</strong></div><div className="mk-global-search"><label><FiSearch /><input ref={searchRef} aria-label="Tìm trong không gian" placeholder="Tìm khách, đặt phòng, công việc…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && matches[0]) { navigate(matches[0].path); setQuery(''); } }} /><kbd>⌘ K</kbd></label>{query && <div className="mk-search-results" role="region" aria-label="Kết quả tìm kiếm">{matches.length ? matches.map(item => <Link key={item.path} to={item.path} onClick={() => setQuery('')}><FiSearch /><span>{item.label}<small>{item.type}</small></span><FiArrowUpRight /></Link>) : <p>Không tìm thấy kết quả phù hợp.</p>}</div>}</div><div className="mk-topbar-right">{data?.capabilities.localDemo && <span className="mk-demo-badge"><span />Môi trường demo</span>}<button className="mk-icon-button" aria-label="Làm mới dữ liệu" onClick={() => void reload()}><FiRefreshCw /></button><Link className="mk-inbox-shortcut mk-icon-button" to="/admin/dashboard/messages" aria-label={`Hộp thư, ${unread} chưa đọc`}><FiMessageSquare />{unread > 0 && <i />}</Link></div></header>
      <main id="workspace-main" tabIndex={-1} className="mk-main-content">{error && <div className="mk-alert error" role="alert">{error}<Link className="mk-subtle-link" to="/setup">Hướng dẫn thiết lập Supabase</Link><Button onClick={() => void reload()}>Thử lại</Button></div>}{loading ? <div className="mk-page-loading" role="status"><span className="mk-loading-ring" />Đang mở không gian của bạn…</div> : data ? <>{data.capabilities.localDemo && !data.properties.length && !data.contacts.length && <div className="mk-welcome-banner"><div><strong>Chào mừng đến không gian của bạn</strong><p>Khám phá toàn bộ quy trình với dữ liệu mẫu hoặc bắt đầu bằng bản ghi đầu tiên.</p></div><Button busy={busy} onClick={() => void seed()}><FiPlusCircle />Tạo dữ liệu mẫu</Button></div>}<Outlet /></> : null}</main><footer className="mk-app-footer"><span>MaokiHouse · Chăm chút từng kỳ nghỉ</span><span>Vận hành từ một nơi <span className="mk-dot" /></span></footer>
    </div>
  </div>;
}
