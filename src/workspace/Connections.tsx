import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCalendar, FiCheckCircle, FiCopy, FiExternalLink, FiLink, FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import { requireSupabase } from '../lib/supabase/client';
import { useWorkspace } from './context';
import { useSession } from './Session';
import { canEdit } from './permissions';
import { Button, Dialog, PageHeader } from './ui';
import { errorMessage } from './utils';

interface Connection { id: string; propertyId: string; platform: 'airbnb' | 'booking'; exportToken: string; lastSyncedAt: string | null; lastError: string; blockCount: number }
const names = { airbnb: 'Airbnb', booking: 'Booking.com', facebook: 'Facebook Messenger', instagram: 'Instagram', zalo: 'Zalo OA' };
async function channelRequest<T>(body?: unknown): Promise<T> {
  const { data: { session } } = await requireSupabase().auth.getSession();
  if (!session) throw new Error('Vui lòng đăng nhập lại.');
  const response = await fetch('/api/channels', { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(45000), headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || `Dịch vụ kết nối chưa hoạt động (HTTP ${response.status}). Kiểm tra bản triển khai mới nhất.`);
  return result as T;
}
export default function Connections() {
  const { data, reload } = useWorkspace(); const { mode } = useSession();
  const [connections, setConnections] = useState<Connection[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [platform, setPlatform] = useState<'airbnb' | 'booking' | null>(null); const [social, setSocial] = useState<'facebook' | 'instagram' | 'zalo' | null>(null);
  const [propertyId, setPropertyId] = useState(''); const [url, setURL] = useState(''); const [busy, setBusy] = useState(false); const [remove, setRemove] = useState<Connection | null>(null);
  const enabled = mode === 'supabase' && canEdit(data);
  const load = useCallback(async () => {
    if (mode !== 'supabase' || !canEdit(data)) return;
    setLoading(true);
    try { setConnections((await channelRequest<{ connections: Connection[] }>()).connections); setError(''); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, [mode, data]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return null;
  const action = async (input: unknown) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await channelRequest<{ synced?: boolean; saved?: boolean; disconnected?: boolean; error?: string; conflictCount?: number }>(input);
      if (result.disconnected) { setNotice('Đã gỡ kết nối và vô hiệu hóa liên kết xuất lịch.'); setRemove(null); }
      else if (result.synced) { setNotice(result.conflictCount ? `Đã đồng bộ. Có ${result.conflictCount} khoảng ngày trùng lịch đang có; hãy kiểm tra trên từng kênh.` : 'Đã đồng bộ ngày bận.'); setPlatform(null); }
      else if (result.saved) { setNotice('Đã lưu kết nối.'); setError(result.error || 'Lịch chưa đồng bộ; hãy thử lại.'); setPlatform(null); }
      await load(); await reload();
      if (result.error) setError(result.error);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); setNotice('Đã sao chép liên kết lịch.'); } catch { setError('Hãy chọn liên kết lịch và sao chép thủ công.'); } };
  return <><PageHeader eyebrow="KẾT NỐI TỪNG KÊNH" title="Kết nối" description="Chọn kênh, gắn đúng phòng và quản lý các liên kết tại một nơi."><Button busy={loading} onClick={() => void load()}><FiRefreshCw />Kiểm tra lại</Button></PageHeader>
    {mode === 'demo' ? <p className="mk-alert">Đăng nhập bằng Supabase để kết nối lịch thật. Dữ liệu demo không được gửi sang kênh ngoài.</p> : !canEdit(data) && <p className="mk-alert">Chủ không gian hoặc quản lý thực hiện kết nối. Bạn vẫn xem được ngày bận trên Lịch phòng.</p>}
    {error && <p className="mk-alert error" role="alert">{error} <Link className="mk-subtle-link" to="/setup?mode=channels">Thiết lập dữ liệu iCal</Link></p>}{notice && <p className="mk-alert" role="status">{notice}</p>}
    <div className="mk-channel-grid">{(['airbnb', 'booking'] as const).map(key => <section className="mk-panel mk-channel-card" key={key}><span className={`mk-channel-emblem ${key}`}><FiCalendar /></span><h2>{names[key]}</h2><span className="mk-badge">Lịch iCal · theo từng phòng</span><p>Nhập ngày bận từ {names[key]} và lấy liên kết lịch MaokiHouse để thêm vào kênh.</p><Button kind="primary" disabled={!enabled || busy} onClick={() => { setPlatform(key); setPropertyId(''); setURL(''); setError(''); }}><FiLink />Kết nối {names[key]}</Button></section>)}
      {(['facebook', 'instagram', 'zalo'] as const).map(key => <section className="mk-panel mk-channel-card" key={key}><span className="mk-channel-emblem"><FiLink /></span><h2>{names[key]}</h2><span className="mk-badge pending">Chưa có kết nối API</span><p>{key === 'zalo' ? 'Nhận và trả lời tin nhắn OA cần ứng dụng Zalo được cấp quyền.' : 'Nhận và trả lời tin nhắn cần ứng dụng Meta và quyền truy cập trang.'}</p><Button onClick={() => setSocial(key)}>Yêu cầu để kết nối</Button></section>)}
      <section className="mk-panel mk-channel-card"><span className="mk-channel-emblem"><FiCheckCircle /></span><h2>Chat website</h2><span className={`mk-badge ${data.settings.widgetEnabled ? 'active' : ''}`}>{data.settings.widgetEnabled ? 'Đã bật' : 'Chưa bật'}</span><p>Khách nhắn từ website, đội ngũ trả lời trong hộp thư hợp nhất.</p><Link className="mk-button" to="../settings">Mở cài đặt chat</Link></section>
    </div>
    <div className="mk-alert">iCal chỉ trao đổi ngày bận/trống, không đồng bộ giá, tin nhắn hay thông tin khách. Nhấn Đồng bộ để nhập lịch mới; các kênh lấy lịch xuất theo chu kỳ riêng. Chưa có đồng bộ nền liên tục.</div>
    <section className="mk-panel mk-settings-panel"><h2>Lịch đã kết nối</h2>{loading && <p role="status">Đang kiểm tra kết nối…</p>}{!connections.length && !loading && <p>Chọn Airbnb hoặc Booking.com ở trên để kết nối phòng đầu tiên.</p>}{connections.map(connection => {
      const exportURL = `${location.origin}/api/channels?feed=${connection.exportToken}`;
      return <article className="mk-connected-calendar" key={connection.id}><div><strong>{names[connection.platform]} · {data.properties.find(property => property.id === connection.propertyId)?.title || 'Phòng đã kết nối'}</strong><span className={`mk-badge ${connection.lastError ? 'pending' : connection.lastSyncedAt ? 'active' : ''}`}>{connection.lastError ? 'Cần kiểm tra · giữ lịch cũ' : connection.lastSyncedAt ? 'Đã đồng bộ' : 'Chưa đồng bộ'}</span><p>{connection.blockCount} khoảng ngày bận · {connection.lastSyncedAt ? `Lần gần nhất: ${new Date(connection.lastSyncedAt).toLocaleString('vi-VN', { timeZone: data.settings.timezone })}` : 'Chưa có lần đồng bộ thành công'}</p>{connection.lastError && <p className="mk-muted">{connection.lastError}</p>}</div><div className="mk-inline-actions"><Button busy={busy} disabled={!enabled} onClick={() => void action({ action: 'sync', id: connection.id })}><FiRefreshCw />Đồng bộ</Button><Button disabled={busy || !enabled} onClick={() => setRemove(connection)}><FiTrash2 />Gỡ</Button></div><label className="mk-field">Liên kết lịch MaokiHouse để nhập vào {names[connection.platform]}<input value={exportURL} readOnly onFocus={event => event.currentTarget.select()} /></label><Button onClick={() => void copy(exportURL)}><FiCopy />Sao chép lịch MaokiHouse</Button><p className="mk-field-hint">Giữ liên kết này riêng tư. Bất kỳ ai có liên kết đều xem được ngày bận, không xem được tên khách hoặc giá. Gỡ kết nối sẽ vô hiệu hóa liên kết.</p></article>;
    })}</section>
    {platform && <Dialog title={`Kết nối ${names[platform]} bằng iCal`} onClose={() => setPlatform(null)} busy={busy}><form onSubmit={event => { event.preventDefault(); void action({ action: 'connect', platform, propertyId, url }); }}><div className="mk-dialog-body"><ol className="mk-connect-steps"><li>{platform === 'airbnb' ? 'Mở lịch của căn trên Airbnb, tìm phần kết nối/đồng bộ lịch và sao chép liên kết xuất lịch.' : 'Mở Extranet Booking.com của chỗ nghỉ, tìm mục đồng bộ lịch và sao chép liên kết xuất lịch. Một số loại chỗ nghỉ không có tính năng này.'}</li><li>Chọn đúng phòng tương ứng trên MaokiHouse, dán liên kết và kết nối.</li><li>Sau khi kết nối, sao chép lịch MaokiHouse ở danh sách bên dưới và thêm vào mục nhập lịch của kênh để trao đổi lịch hai chiều.</li></ol><p className="mk-field-hint">Mỗi phòng trên MaokiHouse tương ứng một đơn vị bán độc lập. Không dùng cùng một lịch cho cả kho nhiều phòng cùng loại.</p><label className="mk-field">Phòng / căn hộ<select aria-label="Phòng / căn hộ" required value={propertyId} onChange={event => setPropertyId(event.target.value)}><option value="">Chọn phòng tương ứng</option>{data.properties.filter(property => !connections.some(item => item.propertyId === property.id && item.platform === platform)).map(property => <option key={property.id} value={property.id}>{property.title}</option>)}</select></label><label className="mk-field">Liên kết xuất lịch iCal của {names[platform]}<input type="url" required maxLength={4096} autoComplete="off" value={url} onChange={event => setURL(event.target.value)} placeholder={platform === 'airbnb' ? 'https://www.airbnb.com/calendar/ical/…' : 'https://admin.booking.com/hotel/hoteladmin/ical.html?…'} /></label><p className="mk-field-hint">Dán liên kết file lịch, không nhập mật khẩu tài khoản. Chỉ nhập lịch lưu trú theo ngày.</p>{error && <p className="mk-alert error" role="alert">{error}</p>}</div><footer><Button disabled={busy} onClick={() => setPlatform(null)}>Hủy</Button><Button kind="primary" type="submit" busy={busy}>Kết nối và đồng bộ</Button></footer></form></Dialog>}
    {remove && <Dialog title="Gỡ kết nối lịch?" onClose={() => setRemove(null)} busy={busy}><div className="mk-dialog-body"><p>Các ngày bận đã nhập từ kết nối này sẽ được gỡ khỏi MaokiHouse. Đặt phòng đang có được giữ. Liên kết lịch xuất sẽ hết hiệu lực; hãy gỡ lịch MaokiHouse khỏi kênh tương ứng.</p></div><footer><Button disabled={busy} onClick={() => setRemove(null)}>Hủy</Button><Button kind="danger" busy={busy} onClick={() => void action({ action: 'disconnect', id: remove.id })}>Gỡ kết nối</Button></footer></Dialog>}
    {social && <Dialog title={`Kết nối ${names[social]}`} onClose={() => setSocial(null)}><div className="mk-dialog-body"><p>{social === 'zalo' ? 'Cần Zalo OA, tài khoản quản trị OA và ứng dụng nhà phát triển Zalo được cấp quyền.' : 'Cần quyền quản trị Fanpage hoặc tài khoản Instagram Professional và ứng dụng nhà phát triển Meta được cấp quyền tin nhắn.'}</p><p>Tích hợp đăng nhập, cấp quyền và webhook cho kênh này chưa có trong bản hiện tại. Kênh chưa nhận hoặc gửi tin nhắn thật từ MaokiHouse.</p><a className="mk-subtle-link" href={social === 'zalo' ? 'https://developers.zalo.me/' : 'https://developers.facebook.com/'} target="_blank" rel="noreferrer">Mở trang nhà phát triển<FiExternalLink /></a></div><footer><Button onClick={() => setSocial(null)}>Đã hiểu</Button></footer></Dialog>}
  </>;
}
