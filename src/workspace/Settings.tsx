import { useState } from 'react';
import { FiCheck, FiCopy, FiExternalLink, FiMessageSquare, FiInfo } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWorkspace } from './context';
import { Button, PageHeader, SectionTitle } from './ui';
import Team from './Team';
import { canEdit } from './permissions';
import { publicPath } from './publicApi';
import { errorMessage } from './utils';
import type { BusinessSettings } from '../../shared/workspace';

export default function Settings() {
  const { data, request, reload } = useWorkspace();
  if (!data) return null;
  if (!canEdit(data)) return <><PageHeader title="Cài đặt" description="Vai trò hiện tại chỉ được xem dữ liệu. Liên hệ chủ không gian để thay đổi cài đặt." /><Team /></>;
  return <SettingsForm key={data.workspaceId || 'demo'} demo={data.capabilities.localDemo} initial={data.settings} request={request} reload={reload} />;
}
function SettingsForm({ initial, request, reload, demo }: { demo: boolean; initial: BusinessSettings; request: <T>(path: string, body?: unknown, method?: 'POST' | 'PUT' | 'PATCH') => Promise<T>; reload: () => Promise<void> }) {
  const [form, setForm] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const chatPath = publicPath(`/chat/${form.widgetToken}`, demo);
  const embed = `<iframe src="${window.location.origin}${chatPath}" title="Chat với ${form.businessName.replaceAll('"', '')}" width="380" height="600" style="border:0;border-radius:20px" loading="lazy"></iframe>`;
  const copy = async () => { try { await navigator.clipboard.writeText(embed); toast.success('Đã sao chép mã nhúng'); } catch { toast.error('Không thể truy cập bảng nhớ tạm. Hãy chọn và sao chép mã bên dưới.'); } };
  const set = (key: keyof BusinessSettings, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  return <><PageHeader eyebrow="KHÔNG GIAN CỦA BẠN" title="Cài đặt" description="Một vài chi tiết để mọi thứ mang đúng dấu ấn MaokiHouse." /><form onSubmit={event => { event.preventDefault(); setBusy(true); setError(''); const input = Object.fromEntries(Object.entries(form).filter(([key]) => key !== 'widgetToken')); void request<BusinessSettings>('/settings', input, 'PUT').then(async saved => { setForm(saved); await reload(); toast.success('Đã lưu cài đặt'); }).catch(cause => setError(errorMessage(cause))).finally(() => setBusy(false)); }}><div className="mk-settings-grid"><section className="mk-panel mk-settings-panel"><SectionTitle title="Thông tin thương hiệu" /><div className="mk-form-grid">
    {([['businessName', 'Tên thương hiệu', 'text'], ['email', 'Email liên hệ', 'email'], ['phone', 'Điện thoại', 'tel'], ['address', 'Địa chỉ', 'text']] as const).map(([key, label, type]) => <label className="mk-field" key={key}>{label}<input type={type} value={form[key]} required={key === 'businessName'} onChange={event => set(key, event.target.value)} /></label>)}<label className="mk-field">Đơn vị tiền tệ<select value={form.currency} onChange={event => set('currency', event.target.value)}><option value="VND">Việt Nam Đồng (VND)</option><option value="USD">US Dollar (USD)</option></select></label><label className="mk-field">Múi giờ<select value={form.timezone} onChange={event => set('timezone', event.target.value)}><option value="Asia/Ho_Chi_Minh">Việt Nam · UTC+7</option><option value="Asia/Bangkok">Bangkok · UTC+7</option><option value="Asia/Singapore">Singapore · UTC+8</option><option value="UTC">UTC</option></select></label><label className="mk-field">Giờ nhận phòng<input type="time" value={form.checkinTime} required onChange={event => set('checkinTime', event.target.value)} /></label><label className="mk-field">Giờ trả phòng<input type="time" value={form.checkoutTime} required onChange={event => set('checkoutTime', event.target.value)} /></label></div><div className="mk-alert"><FiInfo />Thay đổi đơn vị tiền tệ chỉ đổi cách hiển thị; không tự quy đổi số tiền đã nhập.</div></section>
    <section className="mk-panel mk-settings-panel"><SectionTitle title="Chat trên website" /><p>Đón lời chào của khách ngay trên website, trả lời trực tiếp từ hộp thư hợp nhất.</p><label className="mk-checkbox"><input type="checkbox" checked={form.widgetEnabled} onChange={event => set('widgetEnabled', event.target.checked)} />Mở kênh trò chuyện</label><label className="mk-field">Lời chào đầu tiên<textarea value={form.widgetGreeting} rows={3} maxLength={1000} required onChange={event => set('widgetGreeting', event.target.value)} /></label>{form.widgetToken ? <><label className="mk-field">Mã nhúng iframe<textarea className="mk-code" value={embed} readOnly rows={4} aria-label="Mã nhúng chat website" /></label><div className="mk-inline-actions"><Button onClick={() => void copy()}><FiCopy />Sao chép mã</Button><Link to={chatPath} className="mk-button secondary" target="_blank" rel="noreferrer"><FiExternalLink />Xem cửa sổ chat</Link></div><p className="mk-field-hint">Lưu cài đặt trước khi mở cửa sổ chat. Khách chỉ xem được cuộc trò chuyện thuộc phiên riêng của họ.</p></> : <div className="mk-alert"><FiMessageSquare />Lưu cài đặt để tạo liên kết chat riêng.</div>}</section></div>{error && <div className="mk-alert error" role="alert">{error}</div>}<div className="mk-settings-save"><Button kind="primary" type="submit" busy={busy}><FiCheck />Lưu cài đặt</Button></div></form><Team /></>;
}
