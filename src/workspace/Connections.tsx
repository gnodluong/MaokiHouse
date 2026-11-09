import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCheck, FiCopy, FiLink, FiRefreshCw, FiTrash2, FiArrowRight } from 'react-icons/fi';
import { useWorkspace } from './context';
import { useSession } from './Session';
import { canEdit } from './permissions';
import { Button, Dialog, PageHeader, SectionTitle } from './ui';
import { errorMessage } from './utils';
import { channelRequest, isStale, syncConnections } from './channelsClient';
import type { CalendarConnection, CalendarPlatform, SyncResult } from './channelsClient';

interface ChannelInfo { name: string; mark: string; color: string; summary: string; exportSteps: string[]; importSteps: string[]; note?: string; placeholder: string }

// Where to find each channel's iCal links. Menu names change over time, so steps name the section, not exact pixels.
export const calendarChannels: Record<CalendarPlatform, ChannelInfo> = {
  airbnb: { name: 'Airbnb', mark: 'A', color: '#e0565f', summary: 'Lịch từng căn trên Airbnb.', placeholder: 'https://www.airbnb.com/calendar/ical/….ics?s=…',
    exportSteps: ['Mở Airbnb (chế độ chủ nhà) → Lịch → chọn đúng căn.', 'Vào phần Tình trạng phòng trống (Availability) → Kết nối/Đồng bộ lịch.', 'Chọn Xuất lịch (Export calendar) và sao chép liên kết kết thúc bằng .ics.'],
    importSteps: ['Ở cùng màn hình đồng bộ lịch trên Airbnb, chọn Nhập lịch (Import calendar).', 'Dán liên kết MaokiHouse ở trên, đặt tên “MaokiHouse” và lưu.'] },
  booking: { name: 'Booking.com', mark: 'B', color: '#1d4f91', summary: 'Lịch theo loại phòng trong Extranet.', placeholder: 'https://admin.booking.com/hotel/hoteladmin/ical.html?t=…',
    exportSteps: ['Mở Extranet Booking.com → Giá & Tình trạng phòng trống → Đồng bộ lịch (Sync calendars).', 'Chọn đúng loại phòng, bấm Xuất lịch và sao chép liên kết.'],
    importSteps: ['Ở mục Đồng bộ lịch của Extranet, chọn Nhập lịch.', 'Dán liên kết MaokiHouse, đặt tên “MaokiHouse” và lưu.'],
    note: 'Booking.com chỉ bật iCal cho một số loại chỗ nghỉ (nhà, căn hộ…). Nếu không thấy mục này, liên hệ Booking.com.' },
  agoda: { name: 'Agoda', mark: 'Ag', color: '#5b3fb8', summary: 'Agoda Homes / YCS có đồng bộ iCal.', placeholder: 'https://… (liên kết .ics từ Agoda)',
    exportSteps: ['Đăng nhập Agoda YCS → Lịch (Calendar) → Đồng bộ lịch / iCal.', 'Sao chép liên kết xuất lịch của đúng phòng.'],
    importSteps: ['Ở cùng mục đồng bộ lịch của Agoda, chọn nhập lịch từ URL.', 'Dán liên kết MaokiHouse và lưu.'],
    note: 'iCal của Agoda thường dành cho chỗ nghỉ dạng nhà. Nếu tài khoản không có mục này, hỏi quản lý tài khoản Agoda.' },
  vrbo: { name: 'Vrbo', mark: 'V', color: '#24408e', summary: 'Lịch Vrbo / HomeAway.', placeholder: 'https://www.vrbo.com/icalendar/….ics',
    exportSteps: ['Mở Vrbo → Lịch → Nhập & xuất lịch (Import/Export).', 'Chọn Xuất lịch và sao chép liên kết.'], importSteps: ['Trong Nhập & xuất lịch, chọn Nhập lịch, dán liên kết MaokiHouse.'] },
  expedia: { name: 'Expedia', mark: 'E', color: '#1f2b6c', summary: 'Partner Central (nhà nghỉ có hỗ trợ iCal).', placeholder: 'https://… (liên kết .ics từ Expedia)',
    exportSteps: ['Expedia Partner Central → Lịch → Đồng bộ lịch (nếu tài khoản hỗ trợ).', 'Sao chép liên kết xuất lịch.'], importSteps: ['Ở cùng mục, nhập lịch từ URL và dán liên kết MaokiHouse.'] },
  traveloka: { name: 'Traveloka', mark: 'T', color: '#0b6fb8', summary: 'Traveloka Tera, khi tài khoản có iCal.', placeholder: 'https://… (liên kết .ics từ Traveloka)',
    exportSteps: ['Traveloka Tera → mục đồng bộ lịch / iCal của phòng.', 'Sao chép liên kết xuất lịch.'], importSteps: ['Nhập liên kết MaokiHouse ở cùng mục, nếu Traveloka cho phép.'],
    note: 'Không phải tài khoản Traveloka nào cũng có iCal; nhiều nơi đồng bộ qua channel manager.' },
  tripcom: { name: 'Trip.com', mark: 'Tr', color: '#2167d8', summary: 'Trip.com eBooking, khi có iCal.', placeholder: 'https://… (liên kết .ics từ Trip.com)',
    exportSteps: ['Trip.com eBooking → mục lịch / đồng bộ iCal của phòng.', 'Sao chép liên kết xuất lịch.'], importSteps: ['Nhập liên kết MaokiHouse ở cùng mục, nếu Trip.com cho phép.'] },
  google: { name: 'Google Calendar', mark: 'G', color: '#1a73e8', summary: 'Lịch riêng của bạn hoặc đội ngũ.', placeholder: 'https://calendar.google.com/calendar/ical/…/private-…/basic.ics',
    exportSteps: ['Mở Google Calendar trên máy tính → Cài đặt của lịch cần dùng.', 'Ở mục Tích hợp lịch, sao chép “Địa chỉ bí mật ở định dạng iCal”.'],
    importSteps: ['Trong Google Calendar: Lịch khác → + → Từ URL.', 'Dán liên kết MaokiHouse và thêm lịch (Google tự cập nhật vài giờ một lần).'],
    note: 'Mỗi sự kiện cả ngày trong lịch Google sẽ thành ngày bận của phòng.' },
  ical: { name: 'Lịch iCal khác', mark: 'iC', color: '#6b6259', summary: 'Bất kỳ kênh hoặc phần mềm nào có liên kết .ics.', placeholder: 'https://… .ics',
    exportSteps: ['Trong kênh hoặc phần mềm đó, tìm mục Xuất lịch / iCal / .ics.', 'Sao chép liên kết HTTPS (không cần đăng nhập để mở).'], importSteps: ['Dán liên kết MaokiHouse vào mục Nhập lịch / iCal của kênh đó.'] },
};
const order: CalendarPlatform[] = ['airbnb', 'booking', 'agoda', 'google', 'vrbo', 'expedia', 'traveloka', 'tripcom', 'ical'];
const messaging = [
  { key: 'facebook', name: 'Facebook Messenger', mark: 'f', color: '#1877f2', text: 'Cần ứng dụng Meta được duyệt quyền nhắn tin của Fanpage.' },
  { key: 'instagram', name: 'Instagram', mark: 'Ig', color: '#c13584', text: 'Cần tài khoản Instagram Professional và ứng dụng Meta được duyệt.' },
  { key: 'zalo', name: 'Zalo OA', mark: 'Z', color: '#0068ff', text: 'Cần Zalo Official Account và ứng dụng nhà phát triển Zalo được cấp quyền.' },
];

const exportLink = (token: string) => `${window.location.origin}/api/channels?feed=${token}`;
const ago = (iso: string | null) => {
  if (!iso) return 'Chưa đồng bộ';
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} giờ trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
};

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="mk-copy-field"><input readOnly value={value} aria-label={label} onFocus={event => event.target.select()} /><Button onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => undefined); }}>{copied ? <FiCheck /> : <FiCopy />}{copied ? 'Đã chép' : 'Sao chép'}</Button></div>;
}

export default function Connections() {
  const { data, reload } = useWorkspace(); const { mode } = useSession();
  const [connections, setConnections] = useState<CalendarConnection[]>([]); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [wizard, setWizard] = useState<{ platform: CalendarPlatform; step: 1 | 2 | 3; propertyId: string; url: string; label: string; result?: CalendarConnection; syncError?: string } | null>(null);
  const [busy, setBusy] = useState(false); const [syncing, setSyncing] = useState<string>(''); const [remove, setRemove] = useState<CalendarConnection | null>(null);
  const [progress, setProgress] = useState('');
  const enabled = mode === 'supabase' && canEdit(data);
  const load = useCallback(async () => {
    if (mode !== 'supabase' || !canEdit(data)) return [];
    setLoading(true);
    try { const list = (await channelRequest<{ connections: CalendarConnection[] }>()).connections; setConnections(list); setError(''); return list; }
    catch (cause) { setError(errorMessage(cause)); return []; }
    finally { setLoading(false); }
  }, [mode, data]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return null;
  const room = (id: string) => data.properties.find(property => property.id === id)?.title || 'Phòng đã xóa';

  const connect = async () => {
    if (!wizard) return;
    setBusy(true); setError('');
    try {
      const result = await channelRequest<SyncResult>({ action: 'connect', platform: wizard.platform, propertyId: wizard.propertyId, url: wizard.url, ...(wizard.label.trim() ? { label: wizard.label.trim() } : {}) });
      const list = await load(); await reload();
      const saved = list.find(item => item.id === result.id);
      setWizard({ ...wizard, step: 3, result: saved, syncError: result.synced ? '' : result.error || 'Đã lưu nhưng chưa tải được lịch; bấm Đồng bộ để thử lại.' });
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const syncOne = async (connection: CalendarConnection) => {
    setSyncing(connection.id); setError(''); setNotice('');
    try {
      const result = await channelRequest<SyncResult>({ action: 'sync', id: connection.id });
      setNotice(result.conflictCount ? `Đã đồng bộ ${calendarChannels[connection.platform].name} · ${room(connection.propertyId)}. Có ${result.conflictCount} khoảng ngày trùng với nơi khác — kiểm tra Lịch phòng.` : `Đã đồng bộ ${calendarChannels[connection.platform].name} · ${room(connection.propertyId)}.`);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSyncing(''); await load(); await reload(); }
  };
  const syncAll = async (onlyStale: boolean) => {
    const list = onlyStale ? connections.filter(item => isStale(item)) : connections;
    if (!list.length) { setNotice('Tất cả lịch đều vừa được đồng bộ.'); return; }
    setSyncing('all'); setError(''); setNotice('');
    const { ok, failed } = await syncConnections(list, (done, total) => setProgress(`${done}/${total}`));
    setProgress(''); setSyncing('');
    setNotice(`Đã đồng bộ ${ok}/${list.length} lịch.` + (failed ? ` ${failed} lịch chưa tải được; xem cột Trạng thái.` : ''));
    await load(); await reload();
  };
  const disconnect = async (connection: CalendarConnection) => {
    setBusy(true); setError('');
    try { await channelRequest({ action: 'disconnect', id: connection.id }); setNotice('Đã gỡ kết nối. Hãy xóa lịch MaokiHouse khỏi kênh đó.'); setRemove(null); await load(); await reload(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const info = wizard ? calendarChannels[wizard.platform] : null;
  const channelTitle = (connection: CalendarConnection) => connection.label ? `${calendarChannels[connection.platform].name} · ${connection.label}` : calendarChannels[connection.platform].name;
  const rooms = data.properties.filter(property => property.status === 'active' || connections.some(connection => connection.propertyId === property.id));
  const startWizard = (propertyId: string) => { setError(''); setWizard({ platform: 'airbnb', step: 1, propertyId, url: '', label: '' }); };

  return <>
    <PageHeader title="Kết nối kênh" description="Mỗi phòng có thể nối nhiều lịch (Airbnb, Booking.com, Agoda, Google Calendar…) để ngày đặt ở kênh này tự khóa ở các kênh còn lại.">
      {enabled && connections.length > 0 && <Button busy={syncing === 'all'} disabled={!!syncing} onClick={() => void syncAll(false)}><FiRefreshCw />{syncing === 'all' && progress ? `Đang đồng bộ ${progress}` : 'Đồng bộ tất cả'}</Button>}
    </PageHeader>
    {mode === 'demo' ? <p className="mk-alert">Đăng nhập bằng tài khoản Supabase để kết nối lịch thật. Dữ liệu demo không gửi sang kênh ngoài.</p> : !canEdit(data) && <p className="mk-alert">Chủ không gian hoặc quản lý thực hiện kết nối. Bạn vẫn xem được ngày bận trên Lịch phòng.</p>}
    {error && <p className="mk-alert error" role="alert">{error} {/iCal|Thiết lập|cập nhật/i.test(error) && <Link className="mk-button" to="/setup?mode=upgrade">Mở trang Thiết lập</Link>}</p>}
    {notice && <p className="mk-alert success" role="status">{notice}</p>}
    {enabled && !data.properties.length && <p className="mk-alert">Chưa có phòng nào. <Link className="mk-button" to="../properties">Thêm phòng</Link></p>}
    {connections.length > 0 && <p className="mk-inline-help" style={{ marginBottom: 12 }}>Lịch tự đồng bộ khi bạn mở trang quản trị nếu lần gần nhất đã quá 1 giờ. {loading && 'Đang tải…'}</p>}

    {rooms.map(property => {
      const list = connections.filter(connection => connection.propertyId === property.id);
      return <section className="mk-panel mk-room-calendars" key={property.id} aria-label={`Lịch của ${property.title}`}>
        <div className="mk-room-calendars-head"><div><h2>{property.title}</h2><small>{list.length ? `${list.length} lịch đang đồng bộ` : 'Chưa nối lịch nào'}</small></div>
          <Button kind={list.length ? 'secondary' : 'primary'} disabled={!enabled} onClick={() => startWizard(property.id)}><FiLink />Thêm lịch</Button></div>
        {list.map(connection => { const channel = calendarChannels[connection.platform]; return <div className="mk-channel-row" key={connection.id}>
          <span className="mk-channel-mark" style={{ background: channel.color }} aria-hidden="true">{channel.mark}</span>
          <div><strong>{channelTitle(connection)}</strong><small><span className={`mk-status ${connection.lastError ? 'error' : connection.lastSyncedAt ? (isStale(connection) ? 'warn' : 'ok') : 'warn'}`}>{connection.lastError ? 'Lỗi · giữ lịch cũ' : ago(connection.lastSyncedAt)}</span> · {connection.blockCount} khoảng ngày bận</small>{connection.lastError && <small>{connection.lastError}</small>}</div>
          <Button busy={syncing === connection.id} disabled={!!syncing} onClick={() => void syncOne(connection)}><FiRefreshCw />Đồng bộ</Button>
          <div className="mk-row-actions">
            <Button onClick={() => setWizard({ platform: connection.platform, step: 3, propertyId: connection.propertyId, url: '', label: connection.label, result: connection })}><FiLink />Link MaokiHouse</Button>
            <button className="mk-icon-button" aria-label={`Gỡ lịch ${channelTitle(connection)} của ${property.title}`} title="Gỡ kết nối" onClick={() => setRemove(connection)}><FiTrash2 /></button>
          </div>
        </div>; })}
      </section>;
    })}

    <section className="mk-panel">
      <SectionTitle title="Tin nhắn" />
      <div className="mk-channel-row"><span className="mk-channel-mark" style={{ background: '#8a4a34' }} aria-hidden="true">W</span><div><strong>Chat trên website</strong><small>Khách nhắn từ website, đội ngũ trả lời trong Hộp thư.</small></div><span className={`mk-status ${data.settings.widgetEnabled ? 'ok' : 'warn'}`}>{data.settings.widgetEnabled ? 'Đang bật' : 'Đang tắt'}</span><Link className="mk-button" to="../settings">Cài đặt chat<FiArrowRight /></Link></div>
      {messaging.map(item => <div className="mk-channel-row" key={item.key}><span className="mk-channel-mark" style={{ background: item.color }} aria-hidden="true">{item.mark}</span><div><strong>{item.name}</strong><small>{item.text}</small></div><span className="mk-status">Chưa hỗ trợ</span><span /></div>)}
    </section>
    <p className="mk-inline-help">iCal chỉ trao đổi ngày bận/trống; giá, tin nhắn và thông tin khách vẫn quản lý trên từng kênh. Các kênh lấy lịch MaokiHouse theo chu kỳ riêng (thường 1–3 giờ).</p>

    {wizard && info && <Dialog wide title={wizard.step === 3 ? `Hoàn tất: ${info.name}` : `Thêm lịch cho ${room(wizard.propertyId)}`} onClose={() => setWizard(null)} busy={busy}>
      <div className="mk-dialog-body">
        <div className="mk-wizard-steps" aria-hidden="true">{[1, 2, 3].map(step => <span key={step} className={wizard.step >= step ? 'is-done' : ''} />)}</div>
        <p className="mk-inline-help" style={{ marginBottom: 12 }}>Bước {wizard.step}/3 · {wizard.step === 1 ? 'Chọn phòng và kênh' : wizard.step === 2 ? `Dán liên kết lịch từ ${info.name}` : `Gửi lịch MaokiHouse sang ${info.name}`}</p>
        {error && <p className="mk-alert error" role="alert">{error}</p>}
        {wizard.step === 1 && <>
          <label className="mk-field">Phòng / căn hộ<select value={wizard.propertyId} onChange={event => setWizard({ ...wizard, propertyId: event.target.value })}><option value="">Chọn phòng…</option>{data.properties.map(property => <option key={property.id} value={property.id}>{property.title}</option>)}</select></label>
          <fieldset className="mk-channel-picker"><legend>Kênh</legend>{order.map(platform => { const channel = calendarChannels[platform]; const has = connections.filter(item => item.propertyId === wizard.propertyId && item.platform === platform).length; return <label key={platform} className={wizard.platform === platform ? 'is-selected' : ''}><input type="radio" name="calendar-channel" value={platform} checked={wizard.platform === platform} onChange={() => setWizard({ ...wizard, platform })} /><span className="mk-channel-mark" style={{ background: channel.color }} aria-hidden="true">{channel.mark}</span><span>{channel.name}{has > 0 && <small>Đã nối {has}</small>}</span></label>; })}</fieldset>
          <label className="mk-field">Tên gợi nhớ (không bắt buộc)<input maxLength={80} value={wizard.label} placeholder="Ví dụ: Listing nguyên căn, Phòng 2 trên Airbnb" onChange={event => setWizard({ ...wizard, label: event.target.value })} /><small>Hữu ích khi một phòng có nhiều listing trên cùng một kênh.</small></label>
        </>}
        {wizard.step === 2 && <>
          <ol className="mk-howto">{info.exportSteps.map(step => <li key={step}>{step}</li>)}</ol>
          {info.note && <p className="mk-inline-help" style={{ marginBottom: 12 }}>{info.note}</p>}
          <label className="mk-field">Liên kết xuất lịch của {info.name}<input type="url" inputMode="url" autoComplete="off" spellCheck={false} value={wizard.url} placeholder={info.placeholder} onChange={event => setWizard({ ...wizard, url: event.target.value })} /><small>Chỉ nhận liên kết HTTPS công khai. Liên kết này được lưu riêng và không hiển thị lại.</small></label>
        </>}
        {wizard.step === 3 && wizard.result && <>
          {wizard.syncError ? <p className="mk-alert error" role="alert">{wizard.syncError}</p> : wizard.url ? <p className="mk-alert success" role="status">Đã nối {info.name} cho {room(wizard.result.propertyId)} và nhập {wizard.result.blockCount} khoảng ngày bận.</p> : null}
          <label className="mk-field">Liên kết lịch MaokiHouse cho lịch này<CopyField label="Liên kết lịch MaokiHouse" value={exportLink(wizard.result.exportToken)} /></label>
          <ol className="mk-howto" style={{ marginTop: 12 }}>{info.importSteps.map(step => <li key={step}>{step}</li>)}</ol>
          <p className="mk-inline-help">Mỗi lịch có liên kết riêng: liên kết này chứa ngày bận của mọi lịch khác của phòng, nên {info.name} sẽ thấy ngày đã bán ở kênh khác. Gỡ kết nối sẽ vô hiệu hóa liên kết.</p>
        </>}
      </div>
      <footer>
        {wizard.step === 1 && <><Button onClick={() => setWizard(null)}>Hủy</Button><Button kind="primary" disabled={!wizard.propertyId} onClick={() => setWizard({ ...wizard, step: 2 })}>Tiếp tục<FiArrowRight /></Button></>}
        {wizard.step === 2 && <><Button disabled={busy} onClick={() => setWizard({ ...wizard, step: 1 })}>Quay lại</Button><Button kind="primary" busy={busy} disabled={wizard.url.trim().length < 10} onClick={() => void connect()}><FiLink />Kết nối và đồng bộ</Button></>}
        {wizard.step === 3 && <>{wizard.url && <Button onClick={() => startWizard(wizard.propertyId)}><FiLink />Thêm lịch khác cho phòng này</Button>}<Button kind="primary" onClick={() => setWizard(null)}>Xong</Button></>}
      </footer>
    </Dialog>}

    {remove && <Dialog title="Gỡ kết nối lịch?" onClose={() => setRemove(null)} busy={busy}><div className="mk-dialog-body"><p>Ngày bận đã nhập từ {channelTitle(remove)} cho {room(remove.propertyId)} sẽ bị xóa khỏi MaokiHouse. Đặt phòng đang có được giữ nguyên. Liên kết lịch MaokiHouse của kết nối này hết hiệu lực; hãy xóa nó khỏi {calendarChannels[remove.platform].name}.</p></div><footer><Button disabled={busy} onClick={() => setRemove(null)}>Hủy</Button><Button kind="danger" busy={busy} onClick={() => void disconnect(remove)}>Gỡ kết nối</Button></footer></Dialog>}
  </>;
}
