import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiCopy, FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import { Button, PageHeader, SectionTitle } from '../../src/workspace/ui';
import { apiOrigin } from '../../src/workspace/apiBase';
import { channelAccounts } from '../../src/workspace/messagingClient';
import type { ChannelAccount, ChannelPlatform } from '../../src/workspace/messagingClient';
import { errorMessage } from '../../src/workspace/utils';
import { useWorkspace } from '../../src/workspace/context';

type FieldDef = { key: string; label: string; secret?: boolean; hint?: string; type?: 'select'; options?: [string, string][] };
const FIELDS: Record<ChannelPlatform, FieldDef[]> = {
  zalo: [
    { key: 'appId', label: 'App ID', hint: 'Zalo Developers → ứng dụng của bạn → Cài đặt' },
    { key: 'oaId', label: 'OA ID' },
    { key: 'appSecret', label: 'Khóa bí mật ứng dụng (Secret key)', secret: true, hint: 'Dùng để xác thực webhook và làm mới token' },
    { key: 'accessToken', label: 'Access token', secret: true, hint: 'Lấy từ Zalo Developers → Công cụ → API Explorer / cấp quyền OA' },
    { key: 'refreshToken', label: 'Refresh token', secret: true, hint: 'Hệ thống tự làm mới khi access token hết hạn' },
  ],
  email: [
    { key: 'provider', label: 'Cách gửi', type: 'select', options: [['smtp', 'SMTP (Gmail, Zoho, hosting…)'], ['resend', 'Resend API']] },
    { key: 'fromName', label: 'Tên người gửi', hint: 'Ví dụ: MaokiHouse' },
    { key: 'fromAddress', label: 'Địa chỉ gửi đi', hint: 'Email khách sẽ thấy và trả lời tới' },
    { key: 'smtpHost', label: 'Máy chủ SMTP', hint: 'Ví dụ: smtp.gmail.com' },
    { key: 'smtpPort', label: 'Cổng SMTP', hint: '587 (khuyên dùng) hoặc 465' },
    { key: 'smtpUser', label: 'Tài khoản SMTP' },
    { key: 'smtpPass', label: 'Mật khẩu SMTP / mật khẩu ứng dụng', secret: true, hint: 'Gmail: dùng “Mật khẩu ứng dụng”, không dùng mật khẩu đăng nhập' },
    { key: 'resendKey', label: 'Resend API key', secret: true, hint: 'Chỉ cần khi chọn Resend' },
  ],
};
const TITLES: Record<ChannelPlatform, string> = { zalo: 'Zalo Official Account', email: 'Email' };

function Account({ platform, account, reloadAccounts, origin }: { platform: ChannelPlatform; account?: ChannelAccount; reloadAccounts: () => Promise<void>; origin: string }) {
  const [values, setValues] = useState<Record<string, string>>({}); const [enabled, setEnabled] = useState(account?.enabled ?? true); const [busy, setBusy] = useState(false);
  useEffect(() => { setEnabled(account?.enabled ?? true); setValues({}); }, [account]);
  const stored = (key: string) => account?.config[key];
  const provider = values.provider ?? String(stored('provider') || 'smtp');
  const fields = FIELDS[platform].filter(field => platform !== 'email' || (provider === 'resend' ? !field.key.startsWith('smtp') : field.key !== 'resendKey'));
  const webhook = account ? `${origin || '(nhập Máy chủ API ở Giao diện & ngôn ngữ)'}/api/inbound?token=${account.inboundToken}` : '';
  const act = async (fn: () => Promise<unknown>, success: string) => { setBusy(true); try { await fn(); await reloadAccounts(); toast.success(success); } catch (cause) { toast.error(errorMessage(cause)); } finally { setBusy(false); } };
  const save = () => act(() => channelAccounts('save', { platform, enabled, config: { ...(platform === 'email' ? { provider } : {}), ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) } }), 'Đã lưu cấu hình');
  return <section className="mk-panel dk-pref"><SectionTitle title={TITLES[platform]}>{account && <span className={`mk-badge ${account.enabled ? 'active' : ''}`}>{account.enabled ? 'Đang bật' : 'Đang tắt'}</span>}</SectionTitle>
    <div className="dk-form-grid">{fields.map(field => <label className="mk-field" key={field.key}><span>{field.label}</span>
      {field.type === 'select' ? <select value={values[field.key] ?? String(stored(field.key) || field.options?.[0][0])} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}>{field.options?.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        : <input type={field.secret ? 'password' : 'text'} autoComplete="off" value={values[field.key] ?? (field.secret ? '' : String(stored(field.key) ?? ''))} placeholder={field.secret && stored(field.key) === true ? '•••••••• đã lưu — để trống để giữ nguyên' : ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} />}
      {field.hint && <small className="mk-field-hint">{field.hint}</small>}</label>)}</div>
    <label className="dk-check"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Bật kênh này</label>
    {account && <div className="dk-webhook"><strong>{platform === 'zalo' ? 'Webhook URL (dán vào Zalo Developers → Webhook)' : 'Địa chỉ nhận email (webhook chuyển tiếp)'}</strong><code>{webhook}</code>
      <div className="dk-inline"><Button disabled={!origin} onClick={() => { void navigator.clipboard.writeText(webhook).then(() => toast.success('Đã sao chép')).catch(() => toast.error('Không sao chép được')); }}><FiCopy />Sao chép</Button>
        <Button busy={busy} onClick={() => void act(() => channelAccounts('rotate', { platform }), 'Đã tạo địa chỉ mới — cập nhật lại ở nơi gửi')}><FiRefreshCw />Tạo địa chỉ mới</Button></div></div>}
    <div className="dk-inline"><Button kind="primary" busy={busy} onClick={() => void save()}>Lưu cấu hình</Button>{account && <Button kind="quiet" busy={busy} onClick={() => void act(() => channelAccounts('delete', { platform }), 'Đã xóa kết nối')}><FiTrash2 />Xóa kết nối</Button>}</div>
    {platform === 'zalo' ? <ol className="dk-steps"><li>Tạo ứng dụng tại developers.zalo.me và liên kết với Official Account của bạn.</li><li>Dán App ID, OA ID, Secret key, Access token và Refresh token ở trên rồi bấm Lưu.</li><li>Trong Zalo Developers → Webhook, dán Webhook URL phía trên và bật sự kiện “Người dùng gửi tin nhắn văn bản”.</li><li>Zalo chỉ cho phép trả lời trong 48 giờ kể từ tin nhắn cuối của khách.</li></ol>
      : <ol className="dk-steps"><li>Nhập thông tin gửi (SMTP hoặc Resend) rồi bấm Lưu. Gmail cần bật xác minh 2 bước và tạo “Mật khẩu ứng dụng”.</li><li>Nhận email: thiết lập chuyển tiếp thư tới địa chỉ webhook phía trên bằng Postmark Inbound, Mailgun Routes hoặc dịch vụ tương tự (định dạng JSON hoặc form).</li><li>Mỗi người gửi trở thành một hội thoại; trả lời trong Hộp thư sẽ gửi email kèm tiêu đề “Re: …”.</li></ol>}
  </section>;
}

export default function Messaging() {
  const { data } = useWorkspace(); const [accounts, setAccounts] = useState<ChannelAccount[] | null>(null); const [error, setError] = useState('');
  const load = useCallback(async () => { try { setAccounts(await channelAccounts('status') as ChannelAccount[]); setError(''); } catch (cause) { setError(errorMessage(cause)); } }, []);
  useEffect(() => { void load(); }, [load]);
  const manage = data?.capabilities.role === 'owner' || data?.capabilities.role === 'manager';
  return <>
    <PageHeader title="Zalo OA & Email" description="Nhận và trả lời tin nhắn Zalo Official Account và email ngay trong Hộp thư." />
    {!manage ? <div className="mk-alert">Chỉ chủ không gian và quản lý được cấu hình kênh nhắn tin.</div> : <>
      {error && <div className="mk-alert error" role="alert">{error}</div>}
      {!apiOrigin() && <div className="mk-alert"><span className="mk-dot amber" />Hãy nhập Máy chủ API (địa chỉ website Maoki đã triển khai) ở trang Giao diện & ngôn ngữ để gửi tin và lấy địa chỉ webhook.</div>}
      {accounts && (['zalo', 'email'] as const).map(platform => <Account key={platform} platform={platform} account={accounts.find(item => item.platform === platform)} reloadAccounts={load} origin={apiOrigin()} />)}</>}
  </>;
}
