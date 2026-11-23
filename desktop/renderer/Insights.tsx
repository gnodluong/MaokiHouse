import { useState } from 'react';
import { FiMessageSquare, FiClock, FiLifeBuoy, FiBell, FiPhoneCall, FiStar } from 'react-icons/fi';
import { platformLabels } from '../../shared/workspace';
import type { Conversation, Platform } from '../../shared/workspace';
import { useWorkspace } from '../../src/workspace/context';
import { PageHeader, SectionTitle, Stat, Empty } from '../../src/workspace/ui';
import { enumLabels } from '../../src/workspace/definitions';
import { todayIn } from '../../src/workspace/utils';

const DAY = 86400000;
const ranges: [string, number][] = [['7 ngày', 7], ['30 ngày', 30], ['90 ngày', 90]];

/** Average minutes from the guest's first message to the first host reply, for conversations that got one. */
function firstReplyMinutes(items: Conversation[]) {
  const times = items.flatMap(item => {
    const guest = item.messages.find(message => message.sender === 'guest'); const host = item.messages.find(message => message.sender === 'host');
    return guest && host && host.timestamp >= guest.timestamp ? [(host.timestamp - guest.timestamp) / 60000] : [];
  });
  return times.length ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length) : null;
}
function Bars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map(row => row[1]));
  return <div className="dk-bars">{rows.map(([label, value]) => <div className="dk-bar" key={label}><span>{label}</span><div><i style={{ width: `${(value / max) * 100}%` }} /></div><strong>{value}</strong></div>)}</div>;
}
const count = <T,>(items: T[], key: (item: T) => string) => { const map = new Map<string, number>(); items.forEach(item => map.set(key(item), (map.get(key(item)) || 0) + 1)); return [...map.entries()].sort((a, b) => b[1] - a[1]); };

export default function Insights() {
  const { data } = useWorkspace(); const [days, setDays] = useState(30);
  if (!data) return null;
  const since = Date.now() - days * DAY;
  const conversations = data.conversations.filter(item => (item.lastMessageAt || item.createdAt || 0) >= since);
  const reply = firstReplyMinutes(conversations);
  const today = todayIn(data.settings.timezone);
  const openTickets = data.tickets.filter(ticket => ticket.status !== 'done');
  const overdue = openTickets.filter(ticket => ticket.deadline && ticket.deadline < today);
  const dueReminders = data.reminders.filter(item => item.status !== 'done' && item.dueDate <= today);
  const byChannel = count(conversations, item => platformLabels[item.platform as Platform] || item.platform);
  const byAssignee = count(conversations, item => item.assignee || 'Chưa phân công');
  const byTag = count(conversations.flatMap(item => item.tags.map(tag => ({ tag }))), item => item.tag);
  const byTicketStatus = count(data.tickets, ticket => enumLabels[ticket.status] || ticket.status);
  const byTicketType = count(data.tickets, ticket => ticket.type || 'Chưa phân loại');
  const periodCalls = data.calls.filter(item => !item.startedAt || Date.parse(item.startedAt) >= since);
  const answeredCalls = periodCalls.filter(item => item.status === 'answered');
  const avgCall = answeredCalls.length ? Math.round(answeredCalls.reduce((sum, item) => sum + item.durationSec, 0) / answeredCalls.length) : 0;
  const byCallResult = count(periodCalls, item => enumLabels[item.status] || item.status);
  const byCallDirection = count(periodCalls, item => enumLabels[item.direction] || item.direction);
  const performance = byAssignee.map(([name]) => { const own = conversations.filter(item => (item.assignee || 'Chưa phân công') === name); return { name, total: own.length, closed: own.filter(item => item.status === 'closed').length, reply: firstReplyMinutes(own) }; });
  return <>
    <PageHeader title="Thống kê hội thoại" description="Khối lượng hội thoại, hiệu suất người phụ trách, tag, phiếu ghi và nhắc việc trong khoảng thời gian bạn chọn."><div className="mk-segment" role="group" aria-label="Khoảng thời gian">{ranges.map(([label, value]) => <button key={value} type="button" className={days === value ? 'selected' : ''} onClick={() => setDays(value)}>{label}</button>)}</div></PageHeader>
    <div className="mk-stats-grid">
      <Stat label="Tổng hội thoại" value={conversations.length} note={`${conversations.filter(item => item.status === 'open').length} hội thoại đang mở`} icon={<FiMessageSquare />} />
      <Stat label="Phản hồi đầu tiên trung bình" value={reply === null ? '—' : `${reply} phút`} note={reply === null ? 'Chưa có phản hồi' : 'Từ tin nhắn đầu của khách'} icon={<FiClock />} />
      <Stat label="Phiếu ghi chưa xong" value={openTickets.length} note={`${overdue.length} phiếu quá hạn`} icon={<FiLifeBuoy />} />
      <Stat label="Nhắc việc đến hạn" value={dueReminders.length} note="Hôm nay hoặc đã quá hạn" icon={<FiBell />} />
    </div>
    <div className="dk-two">
      <section className="mk-panel"><SectionTitle title="Hội thoại theo kênh" />{byChannel.length ? <Bars rows={byChannel} /> : <Empty title="Chưa có hội thoại trong kỳ" text="Dữ liệu chăm sóc khách sẽ xuất hiện khi có hội thoại mới." />}</section>
      <section className="mk-panel"><SectionTitle title="Hội thoại theo tag" />{byTag.length ? <Bars rows={byTag} /> : <Empty title="Chưa gắn tag" text="Gắn tag cho hội thoại để xem bức tranh nhu cầu của khách." />}</section>
    </div>
    <section className="mk-panel"><SectionTitle title="Hiệu suất người phụ trách" />{performance.length ? <div className="mk-table-scroll"><table className="mk-table"><thead><tr><th scope="col">Người phụ trách</th><th scope="col">Hội thoại</th><th scope="col">Đã hoàn tất</th><th scope="col">Phản hồi đầu tiên</th></tr></thead><tbody>{performance.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.total}</td><td>{row.closed}</td><td>{row.reply === null ? '—' : `${row.reply} phút`}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có hội thoại trong kỳ" text="Dữ liệu chăm sóc khách sẽ xuất hiện khi có hội thoại mới." />}</section>
    <div className="mk-stats-grid">
      <Stat label="Cuộc gọi" value={periodCalls.length} note={`${periodCalls.filter(item => item.direction === 'inbound').length} cuộc gọi đến`} icon={<FiPhoneCall />} />
      <Stat label="Cuộc gọi nhỡ" value={periodCalls.filter(item => item.direction === 'inbound' && item.status === 'missed').length} note="Gọi đến chưa nghe máy" icon={<FiPhoneCall />} />
      <Stat label="Thời lượng trung bình" value={avgCall ? `${Math.floor(avgCall / 60)}:${String(avgCall % 60).padStart(2, '0')}` : '—'} note="Các cuộc đã nghe máy" icon={<FiClock />} />
      <Stat label="Đánh giá Google" value={data.reviews.length ? (data.reviews.reduce((sum, item) => sum + item.rating, 0) / data.reviews.length).toFixed(1) : '—'} note={`${data.reviews.filter(item => item.status === 'new').length} chưa phản hồi`} icon={<FiStar />} />
    </div>
    <div className="dk-two">
      <section className="mk-panel"><SectionTitle title="Cuộc gọi theo kết quả" />{byCallResult.length ? <Bars rows={byCallResult} /> : <Empty title="Chưa có cuộc gọi" text="Kết nối tổng đài trong Kênh nhắn tin để xem nhật ký cuộc gọi." />}</section>
      <section className="mk-panel"><SectionTitle title="Cuộc gọi theo hướng" />{byCallDirection.length ? <Bars rows={byCallDirection} /> : <Empty title="Chưa có cuộc gọi" text="Kết nối tổng đài trong Kênh nhắn tin để xem nhật ký cuộc gọi." />}</section>
    </div>
    <div className="dk-two">
      <section className="mk-panel"><SectionTitle title="Phiếu ghi theo trạng thái" />{byTicketStatus.length ? <Bars rows={byTicketStatus} /> : <Empty title="Chưa có phiếu ghi" text="Tạo phiếu ghi cho các yêu cầu cần xử lý lâu hơn một cuộc chat." />}</section>
      <section className="mk-panel"><SectionTitle title="Phiếu ghi theo loại" />{byTicketType.length ? <Bars rows={byTicketType} /> : <Empty title="Chưa có phiếu ghi" text="Tạo phiếu ghi cho các yêu cầu cần xử lý lâu hơn một cuộc chat." />}</section>
    </div>
  </>;
}
