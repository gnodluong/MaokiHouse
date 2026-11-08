import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowUpRight, FiCalendar, FiDollarSign, FiHome, FiMessageSquare, FiPlus, FiCheck, FiArrowRight, FiClock, FiFeather } from 'react-icons/fi';
import { useSession } from './Session';
import { channelRequest } from './channelsClient';
import { aiRequest } from './aiClient';
import toast from 'react-hot-toast';
import { useEditor, useWorkspace } from './context';
import { Badge, Button, Empty, PageHeader, SectionTitle, Stat } from './ui';
import { addDays, dateLabel, errorMessage, initials, money, occupancy, propertyName, todayIn } from './utils';

interface Step { key: string; title: string; text: string; done: boolean; to: string; action: string }
const DISMISS_KEY = 'maoki:setup-checklist-hidden';

/** First-run checklist: each step is detected from real data, not ticked by hand. */
function SetupChecklist({ steps }: { steps: Step[] }) {
  const [hidden, setHidden] = useState(() => { try { return window.localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } });
  const done = steps.filter(step => step.done).length;
  if (hidden || !steps.length || done === steps.length) return null;
  return <section className="mk-panel mk-checklist" aria-labelledby="setup-checklist-title">
    <div className="mk-checklist-head"><div><h2 id="setup-checklist-title">Bắt đầu với MaokiHouse</h2><p>Đã xong {done}/{steps.length} bước. Mỗi bước tự đánh dấu khi bạn hoàn tất.</p></div>
      <div className="mk-checklist-progress" role="progressbar" aria-label="Tiến độ thiết lập" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <Button kind="quiet" onClick={() => { setHidden(true); try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch { /* not persisted */ } }}>Ẩn</Button></div>
    <ol>{steps.map(step => <li key={step.key} className={step.done ? 'is-done' : ''}><span className="mk-check-mark" aria-hidden="true"><FiCheck /></span><div><strong>{step.title}</strong><small>{step.text}</small></div>{!step.done && <Link className="mk-button" to={step.to}>{step.action}<FiArrowRight aria-hidden="true" /></Link>}<span className="mk-sr">{step.done ? 'Đã xong' : 'Chưa xong'}</span></li>)}</ol>
  </section>;
}

export default function Overview() {
  const { data, save } = useWorkspace(); const editor = useEditor(); const [period, setPeriod] = useState<'today' | 'week'>('today');
  const { mode } = useSession();
  const role = data?.capabilities.role;
  const [calendarCount, setCalendarCount] = useState<number | null>(null);
  const [aiReady, setAIReady] = useState<boolean | null>(null);
  useEffect(() => {
    if (mode !== 'supabase' || !role) return;
    const controller = new AbortController();
    if (['owner', 'manager'].includes(role)) void channelRequest<{ connections: unknown[] }>().then(result => setCalendarCount(result.connections.length)).catch(() => setCalendarCount(null));
    void aiRequest<{ configured: boolean }>('GET', controller.signal).then(result => setAIReady(result.configured)).catch(() => setAIReady(null));
    return () => controller.abort();
  }, [mode, role]);
  if (!data) return null;
  const manager = role === 'owner' || role === 'manager';
  const steps: Step[] = manager ? [
    { key: 'property', title: 'Thêm phòng đầu tiên', text: 'Tên, giá cơ bản, sức chứa và ảnh của từng phòng/căn hộ.', done: data.properties.length > 0, to: 'properties', action: 'Thêm phòng' },
    { key: 'publish', title: 'Mở đặt phòng trực tiếp trên website', text: 'Bật “Mở trang đặt phòng trực tiếp” cho phòng muốn bán.', done: data.properties.some(item => (item as { published?: boolean }).published), to: 'properties', action: 'Mở phòng' },
    ...(calendarCount !== null ? [{ key: 'calendar', title: 'Kết nối lịch Airbnb, Booking.com…', text: 'Nhập ngày bận từ các kênh để không bị trùng phòng.', done: calendarCount > 0, to: 'channels', action: 'Kết nối lịch' }] : []),
    { key: 'chat', title: 'Bật chat trên website', text: 'Khách nhắn từ website, đội ngũ trả lời trong Hộp thư.', done: data.settings.widgetEnabled, to: 'settings', action: 'Bật chat' },
    ...(aiReady !== null ? [{ key: 'ai', title: 'Kết nối trợ lý AI', text: 'Dán API key OpenRouter để soạn tin và nội dung nhanh hơn.', done: aiReady, to: 'ai', action: 'Cài đặt AI' }] : []),
    { key: 'guide', title: 'Viết sổ tay lưu trú', text: 'Wi-Fi, cách nhận phòng và nội quy gửi khách trước ngày đến.', done: data.guidebooks.length > 0, to: 'guidebooks', action: 'Viết sổ tay' },
  ] : [];
  const today = todayIn(data.settings.timezone); const end = period === 'today' ? today : addDays(today, 6);
  const upcoming = data.bookings.filter(b => b.status !== 'cancelled' && ((b.checkIn >= today && b.checkIn <= end) || (b.checkOut >= today && b.checkOut <= end))).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const month = today.slice(0, 7); const ledger = data.revenue.filter(row => row.date.startsWith(month));
  const income = ledger.reduce((sum, row) => sum + (row.type === 'expense' ? -row.amount : row.amount), 0);
  const stays = data.bookings.filter(b => b.status === 'confirmed' && b.checkIn <= today && b.checkOut > today);
  const activeProperties = data.properties.filter(property => property.status === 'active');
  const unread = data.conversations.filter(thread => thread.unread && thread.status !== 'closed').length;
  const tasks = [...data.tasks].filter(task => task.status !== 'done').sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
  const greeting = new Intl.DateTimeFormat('vi-VN', { timeZone: data.settings.timezone, hour: 'numeric', hourCycle: 'h23' }).format(new Date());
  const weekStart = addDays(today, -6);
  const sevenDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const dateText = new Date(today + 'T12:00:00').toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return <><PageHeader title={`${Number(greeting) < 12 ? 'Chào buổi sáng' : Number(greeting) < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'}`} description={`${dateText.charAt(0).toUpperCase() + dateText.slice(1)} · Tình hình hôm nay và những việc cần làm.`}><Link className="mk-button secondary" to="calendar"><FiCalendar />Xem lịch phòng</Link><Button kind="primary" onClick={() => editor.open('bookings')}><FiPlus />Tạo đặt phòng</Button></PageHeader>
    <SetupChecklist steps={steps} />
    <div className="mk-stats-grid"><Stat label="Công suất hôm nay" value={`${activeProperties.length ? Math.round(stays.filter(stay => activeProperties.some(property => property.id === stay.propertyId)).length / activeProperties.length * 100) : 0}%`} note={`${stays.length} phòng có khách / ${activeProperties.length} phòng hoạt động`} icon={<FiHome />} /><Stat label="Đặt phòng sắp tới" value={data.bookings.filter(b => b.status !== 'cancelled' && b.checkIn >= today && b.checkIn < addDays(today, 7)).length} note="Nhận phòng trong 7 ngày tới" icon={<FiCalendar />} /><Stat label="Doanh thu tháng này" value={money(income, data.settings.currency)} note="Dòng tiền thực thu trừ chi phí đã ghi" icon={<FiDollarSign />} /><Stat label="Hội thoại chưa đọc" value={unread} note={`${data.conversations.filter(c => c.status === 'open').length} hội thoại đang mở`} icon={<FiMessageSquare />} /></div>
    <div className="mk-overview-grid"><section className="mk-panel mk-arrivals"><SectionTitle title="Nhịp đón khách"><div className="mk-segment"><button className={period === 'today' ? 'selected' : ''} onClick={() => setPeriod('today')}>Hôm nay</button><button className={period === 'week' ? 'selected' : ''} onClick={() => setPeriod('week')}>7 ngày tới</button></div></SectionTitle><div className="mk-arrival-caption"><span className="mk-dot" />{upcoming.filter(b => b.checkIn >= today && b.checkIn <= end).length} nhận phòng <span className="mk-soft-divider">/</span> {upcoming.filter(b => b.checkOut >= today && b.checkOut <= end).length} trả phòng</div>
    {!upcoming.length ? <Empty title="Lịch đón khách đang thảnh thơi" text="Các lượt nhận và trả phòng sẽ xuất hiện ở đây khi có đặt phòng." action="Tạo đặt phòng" onAction={() => editor.open('bookings')} /> : <div className="mk-arrival-list">{upcoming.slice(0, 5).map(booking => <button className="mk-arrival-row" key={booking.id} onClick={() => editor.open('bookings', booking)}><span className="mk-avatar">{initials(booking.guestName)}</span><span className="mk-arrival-person"><strong>{booking.guestName}</strong><small>{propertyName(data, booking.propertyId)}</small></span><span className="mk-arrival-date">{dateLabel(booking.checkIn)}<FiArrowRight />{dateLabel(booking.checkOut)}</span><Badge value={booking.status} /><FiArrowUpRight /></button>)}</div>}<Link className="mk-panel-bottom-link" to="bookings">Xem tất cả đặt phòng<FiArrowRight /></Link></section>
    <section className="mk-panel mk-tasks-panel"><SectionTitle title="Cần bạn một chút"><Link to="tasks" className="mk-subtle-link">Tất cả<FiArrowUpRight /></Link></SectionTitle>{tasks.length ? <div className="mk-task-list">{tasks.map(task => <div key={task.id} className="mk-task-row"><button className="mk-task-check" aria-label={`Hoàn tất ${task.title}`} onClick={() => void save('tasks', { status: 'done' }, task.id).then(() => toast.success('Đã hoàn tất công việc')).catch(cause => toast.error(errorMessage(cause)))}><FiCheck /></button><button className="mk-task-details" onClick={() => editor.open('tasks', task)}><strong>{task.title}</strong><small>{propertyName(data, task.propertyId)}</small><span><FiClock />{dateLabel(task.dueDate)} · {task.assignee || 'Chưa phân công'}</span></button><span className={`mk-priority-dot ${task.priority}`} title={task.priority === 'high' ? 'Ưu tiên cao' : 'Thông thường'} /></div>)}</div> : <Empty title="Mọi việc đã đâu vào đấy" text="Thêm công việc để cả đội cùng theo dõi." action="Thêm công việc" onAction={() => editor.open('tasks')} />}</section>
    <section className="mk-panel mk-occupancy-panel"><SectionTitle title="Nhịp lưu trú trong tuần"><Link to="reports" className="mk-subtle-link">Báo cáo<FiArrowUpRight /></Link></SectionTitle><div className="mk-occupancy-body"><div className="mk-occupancy-number"><strong>{occupancy(data.bookings, weekStart, 7, activeProperties.length)}<small>%</small></strong><p>Công suất 7 ngày gần nhất</p><span>Dựa trên các đêm đã giữ phòng</span></div><div className="mk-week-chart" role="img" aria-label="Công suất phòng trong 7 ngày gần nhất">{sevenDays.map(day => { const rate = occupancy(data.bookings, day, 1, activeProperties.length); return <div key={day} className={day === today ? 'today' : ''}><span className="mk-chart-value">{rate}%</span><div className="mk-bar-track"><div style={{ height: `${rate}%` }} /></div><small>{new Date(day + 'T12:00:00').toLocaleDateString('vi-VN', { weekday: 'short' })}</small></div>; })}</div></div></section>
    <section className="mk-panel mk-activity-panel"><SectionTitle title="Chuyện trong không gian"><span className="mk-live-label"><span className="mk-dot" />Gần đây</span></SectionTitle>{data.activity.length ? <ol className="mk-activity-list">{data.activity.slice(0, 4).map(event => <li key={event.id}><span className="mk-activity-pin" /><div><strong>{event.label}</strong><p>{event.action === 'create' ? 'Đã tạo' : event.action === 'delete' ? 'Đã xóa' : event.action === 'automation' ? 'Đã chạy quy tắc' : 'Đã cập nhật'} · {event.actor}</p></div><time>{new Date(event.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: data.settings.timezone })}</time></li>)}</ol> : <div className="mk-quiet-empty"><FiFeather /><p>Những thay đổi của bạn và đội ngũ sẽ được ghi lại tại đây.</p></div>}</section></div>
    
  </>;
}
