import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiAlertTriangle, FiAlertCircle, FiCheckCircle, FiRefreshCw } from 'react-icons/fi';
import { useEditor, useWorkspace } from './context';
import { Button, Empty, PageHeader } from './ui';
import { computeAlerts } from './stay';
import type { StayAlert } from './stay';
import { channelRequest, isStale } from './channelsClient';
import type { CalendarConnection } from './channelsClient';
import { channelAccounts } from './messagingClient';
import { todayIn } from './utils';

/** One place for what needs a decision today: double bookings, unattached orders, unpaid arrivals, broken or stale channels. */
export default function Alerts() {
  const { data } = useWorkspace(); const editor = useEditor();
  const [connections, setConnections] = useState<CalendarConnection[]>([]); const [failed, setFailed] = useState(0); const [loading, setLoading] = useState(false); const [note, setNote] = useState('');
  const load = async () => {
    setLoading(true); setNote('');
    const [calendars, queue] = await Promise.allSettled([channelRequest<{ connections: CalendarConnection[] }>(), channelAccounts('queue') as Promise<{ counts?: { failed?: number } }>]);
    setConnections(calendars.status === 'fulfilled' ? calendars.value.connections : []);
    setFailed(queue.status === 'fulfilled' ? Number(queue.value?.counts?.failed || 0) : 0);
    if (calendars.status === 'rejected' && queue.status === 'rejected') setNote('Chưa kiểm tra được kênh và hàng đợi tin nhắn. Các cảnh báo đơn phòng bên dưới vẫn chính xác.');
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  if (!data) return null;
  const names = Object.fromEntries(data.properties.map(item => [item.id, item.title]));
  const alerts = computeAlerts({ bookings: data.bookings, propertyIds: data.properties.map(item => item.id), propertyNames: names, today: todayIn(data.settings.timezone), connections: connections.map(item => ({ propertyId: item.propertyId, label: item.label, platform: item.platform, lastError: item.lastError, stale: isStale(item) })), failedQueue: failed });
  const open = (alert: StayAlert) => { const booking = alert.bookingId ? data.bookings.find(item => item.id === alert.bookingId) : undefined; if (booking) editor.open('bookings', booking); };
  return <>
    <PageHeader title="Cảnh báo" description="Những việc cần quyết định hôm nay: đơn trùng lịch, đơn chưa gắn phòng, khách sắp đến mà chưa thanh toán, kênh lỗi hoặc lâu chưa đồng bộ."><Button onClick={() => void load()} busy={loading}><FiRefreshCw />Kiểm tra lại</Button></PageHeader>
    {note && <div className="mk-alert"><span className="mk-dot amber" />{note}</div>}
    {!alerts.length ? <Empty title="Không có gì cần xử lý" text="Không có đơn trùng, đơn mồ côi hay kênh lỗi vào lúc này." /> : <div className="mk-panel">{alerts.map((alert, index) => <div key={index} className="mk-alert-row" style={{ display: 'flex', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--line, rgba(128,128,128,.2))', alignItems: 'flex-start' }}>
      <span aria-hidden style={{ marginTop: 2 }}>{alert.severity === 'high' ? <FiAlertTriangle /> : <FiAlertCircle />}</span>
      <div style={{ flex: 1 }}><strong>{alert.title}</strong><p className="mk-muted" style={{ margin: '4px 0 0' }}>{alert.detail}</p></div>
      {alert.bookingId ? <Button onClick={() => open(alert)}>Mở đơn</Button> : alert.kind.startsWith('channel') ? <Link className="mk-text-button" to="../channels">Mở kênh</Link> : null}
    </div>)}</div>}
    {alerts.length === 0 && <p className="mk-muted" style={{ marginTop: 12 }}><FiCheckCircle /> Cập nhật tự động khi dữ liệu thay đổi.</p>}
  </>;
}
