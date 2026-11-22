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
const FIELDS: Record<'zalo' | 'email', FieldDef[]> & Partial<Record<ChannelPlatform, FieldDef[]>> = {
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
const META_FIELDS: FieldDef[] = [
  { key: 'appSecret', label: 'App Secret', secret: true, hint: 'Meta for Developers → ứng dụng → Cài đặt → Cơ bản. Dùng để xác thực webhook' },
  { key: 'pageId', label: 'Page ID / Instagram account ID', hint: 'Facebook: ID của Fanpage. Instagram: ID tài khoản Instagram chuyên nghiệp' },
  { key: 'pageAccessToken', label: 'Page access token', secret: true, hint: 'Token dài hạn của Fanpage đã liên kết, có quyền pages_messaging (và instagram_manage_messages)' },
];
FIELDS.facebook = META_FIELDS; FIELDS.instagram = META_FIELDS;
FIELDS.whatsapp = [
  { key: 'appSecret', label: 'App Secret', secret: true, hint: 'Meta for Developers → ứng dụng → Cài đặt → Cơ bản. Dùng để xác thực webhook' },
  { key: 'phoneNumberId', label: 'Phone number ID', hint: 'WhatsApp → API Setup → Phone number ID (chỉ gồm chữ số)' },
  { key: 'accessToken', label: 'Access token', secret: true, hint: 'Nên dùng token vĩnh viễn của System User có quyền whatsapp_business_messaging' },
];
FIELDS.tiktok = [
  { key: 'outboundUrl', label: 'Địa chỉ cầu nối gửi tin (https)', hint: 'Dịch vụ của đối tác hoặc automation nhận tin trả lời và gửi sang TikTok' },
  { key: 'outboundToken', label: 'Token cầu nối', secret: true, hint: 'Được gửi kèm dưới dạng Authorization: Bearer' },
];
FIELDS.phone = [
  { key: 'provider', label: 'Nhà cung cấp tổng đài', hint: 'Ví dụ: Stringee, VoiceCloud, Twilio, CareSoft…' },
  { key: 'hotline', label: 'Số hotline', hint: 'Chỉ để hiển thị và nhận diện' },
];
FIELDS.google = [
  { key: 'clientId', label: 'OAuth Client ID', hint: 'Google Cloud Console → Credentials → OAuth client' },
  { key: 'clientSecret', label: 'OAuth Client secret', secret: true },
  { key: 'refreshToken', label: 'Refresh token', secret: true, hint: 'Cấp quyền scope business.manage một lần (ví dụ qua OAuth Playground) rồi dán refresh token' },
  { key: 'accountId', label: 'Account ID', hint: 'Chỉ gồm chữ số — phần sau “accounts/” của Business Profile' },
  { key: 'locationId', label: 'Location ID', hint: 'Chỉ gồm chữ số — phần sau “locations/”' },
];
FIELDS.youtube = [
  { key: 'clientId', label: 'OAuth Client ID', hint: 'Google Cloud Console → Credentials → OAuth client' },
  { key: 'clientSecret', label: 'OAuth Client secret', secret: true },
  { key: 'refreshToken', label: 'Refresh token', secret: true, hint: 'Cấp quyền scope youtube.force-ssl cho tài khoản sở hữu kênh rồi dán refresh token' },
  { key: 'channelId', label: 'Channel ID', hint: 'Dạng UC… (YouTube Studio → Cài đặt → Kênh → Thông tin nâng cao)' },
];
const TITLES: Record<ChannelPlatform, string> = { zalo: 'Zalo Official Account', email: 'Email', facebook: 'Facebook Messenger', instagram: 'Instagram Direct', whatsapp: 'WhatsApp Business', tiktok: 'TikTok (qua cầu nối)', phone: 'Tổng đài (nhật ký cuộc gọi)', google: 'Google Business (đánh giá)', youtube: 'YouTube (bình luận)' };

function Account({ platform, account, reloadAccounts, origin }: { platform: ChannelPlatform; account?: ChannelAccount; reloadAccounts: () => Promise<void>; origin: string }) {
  const [values, setValues] = useState<Record<string, string>>({}); const [enabled, setEnabled] = useState(account?.enabled ?? true); const [busy, setBusy] = useState(false);
  useEffect(() => { setEnabled(account?.enabled ?? true); setValues({}); }, [account]);
  const stored = (key: string) => account?.config[key];
  const provider = values.provider ?? String(stored('provider') || 'smtp');
  const fields = (FIELDS[platform] || []).filter(field => platform !== 'email' || (provider === 'resend' ? !field.key.startsWith('smtp') : field.key !== 'resendKey'));
  const meta = platform === 'facebook' || platform === 'instagram' || platform === 'whatsapp';
  const bridge = platform === 'tiktok' || platform === 'phone';
  const webhook = account ? `${origin || '(nhập Máy chủ API ở Giao diện & ngôn ngữ)'}/api/inbound?token=${account.inboundToken}` : '';
  const act = async (fn: () => Promise<unknown>, success: string) => { setBusy(true); try { await fn(); await reloadAccounts(); toast.success(success); } catch (cause) { toast.error(errorMessage(cause)); } finally { setBusy(false); } };
  const save = () => act(() => channelAccounts('save', { platform, enabled, config: { ...(platform === 'email' ? { provider } : {}), ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) } }), 'Đã lưu cấu hình');
  return <section className="mk-panel dk-pref"><SectionTitle title={TITLES[platform]}>{account && <span className={`mk-badge ${account.enabled ? 'active' : ''}`}>{account.enabled ? 'Đang bật' : 'Đang tắt'}</span>}</SectionTitle>
    <div className="dk-form-grid">{fields.map(field => <label className="mk-field" key={field.key}><span>{field.label}</span>
      {field.type === 'select' ? <select value={values[field.key] ?? String(stored(field.key) || field.options?.[0][0])} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}>{field.options?.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        : <input type={field.secret ? 'password' : 'text'} autoComplete="off" value={values[field.key] ?? (field.secret ? '' : String(stored(field.key) ?? ''))} placeholder={field.secret && stored(field.key) === true ? '•••••••• đã lưu — để trống để giữ nguyên' : ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} />}
      {field.hint && <small className="mk-field-hint">{field.hint}</small>}</label>)}</div>
    <label className="dk-check"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Bật kênh này</label>
    {account && !['google', 'youtube'].includes(platform as string) && <div className="dk-webhook"><strong>{platform === 'zalo' ? 'Webhook URL (dán vào Zalo Developers → Webhook)' : meta ? 'Callback URL (dán vào Meta → Webhooks)' : platform === 'phone' ? 'Webhook URL (nhà cung cấp tổng đài gửi sự kiện cuộc gọi tới đây)' : bridge ? 'Webhook URL (dịch vụ cầu nối gửi tin của khách tới đây)' : 'Địa chỉ nhận email (webhook chuyển tiếp)'}</strong><code>{webhook}</code>{(platform === 'facebook' || platform === 'instagram' || platform === 'whatsapp') && <><strong>Verify token</strong><code>{account.verifyToken}</code></>}
      <div className="dk-inline"><Button disabled={!origin} onClick={() => { void navigator.clipboard.writeText(webhook).then(() => toast.success('Đã sao chép')).catch(() => toast.error('Không sao chép được')); }}><FiCopy />Sao chép</Button>
        <Button busy={busy} onClick={() => void act(() => channelAccounts('rotate', { platform }), 'Đã tạo địa chỉ mới — cập nhật lại ở nơi gửi')}><FiRefreshCw />Tạo địa chỉ mới</Button></div></div>}
    <div className="dk-inline"><Button kind="primary" busy={busy} onClick={() => void save()}>Lưu cấu hình</Button>{account && <Button kind="quiet" busy={busy} onClick={() => void act(() => channelAccounts('delete', { platform }), 'Đã xóa kết nối')}><FiTrash2 />Xóa kết nối</Button>}</div>
    {platform === 'phone' ? <ol className="dk-steps"><li>Nhà cung cấp tổng đài (Stringee, VoiceCloud, Twilio…) cần hỗ trợ webhook sự kiện cuộc gọi; app không tự kết nối tới từng nhà cung cấp.</li><li>Cấu hình webhook của nhà cung cấp gửi mỗi cuộc gọi tới Webhook URL phía trên (JSON: callId, direction, from, to, status, durationSec, startedAt, recordingUrl — hoặc dạng form của Twilio).</li><li>Mỗi cuộc gọi xuất hiện trong Nhật ký cuộc gọi, tự khớp với khách theo số điện thoại; các sự kiện sau của cùng callId sẽ cập nhật kết quả, thời lượng và ghi âm.</li><li>Gọi ra bằng nút “Gọi điện” trong danh sách khách (mở ứng dụng gọi điện của máy).</li></ol>
    : platform === 'youtube' ? <ol className="dk-steps"><li>Trong Google Cloud Console, bật YouTube Data API v3 và tạo OAuth client.</li><li>Cấp quyền scope youtube.force-ssl cho tài khoản sở hữu kênh, lấy Refresh token.</li><li>Nhập Client ID, Client secret, Refresh token và Channel ID rồi bấm Lưu.</li><li>Vào Bình luận YouTube và bấm “Đồng bộ từ YouTube”; trả lời trực tiếp từ đó. Hạn mức mặc định của API là 10.000 đơn vị mỗi ngày (mỗi lần đăng phản hồi tốn 50 đơn vị).</li></ol>
    : platform === 'google' ? <ol className="dk-steps"><li>Bật Google Business Profile API cho dự án Google Cloud của bạn và xin Google duyệt quyền truy cập API (bước này do Google thực hiện, có thể mất vài ngày).</li><li>Tạo OAuth client, cấp quyền scope business.manage cho tài khoản quản lý địa điểm và lấy Refresh token.</li><li>Nhập Client ID, Client secret, Refresh token, Account ID, Location ID rồi bấm Lưu.</li><li>Vào Đánh giá Google và bấm “Đồng bộ từ Google”; trả lời trực tiếp từ đó.</li></ol>
    : bridge ? <ol className="dk-steps"><li>TikTok chưa có API nhắn tin công khai để doanh nghiệp tự đăng ký; cần một đối tác chính thức hoặc dịch vụ automation (Make, n8n…) đang có quyền truy cập tin nhắn TikTok Business của bạn.</li><li>Cấu hình dịch vụ đó gửi mỗi tin nhắn mới của khách tới Webhook URL phía trên (POST JSON: from, name, text, messageId, timestamp).</li><li>{'Nhập địa chỉ cầu nối bên trên: khi bạn trả lời trong Hộp thư, MaokiHouse gửi POST JSON {to, text, conversationId} tới địa chỉ đó để chuyển sang TikTok.'}</li></ol>
    : platform === 'whatsapp' ? <ol className="dk-steps"><li>Tại developers.facebook.com tạo ứng dụng Business, thêm sản phẩm WhatsApp và lấy Phone number ID.</li><li>Dán App Secret, Phone number ID và Access token ở trên rồi bấm Lưu.</li><li>Trong WhatsApp → Configuration → Webhook, dán Callback URL và Verify token phía trên rồi đăng ký trường “messages”.</li><li>Chỉ nhắn tự do được trong 24 giờ kể từ tin cuối của khách; ngoài khung đó cần mẫu tin (template) đã duyệt, hiện app chưa gửi template.</li></ol>
    : meta ? <ol className="dk-steps"><li>{platform === 'instagram' ? 'Tại developers.facebook.com tạo ứng dụng loại Business, thêm sản phẩm Messenger và Instagram, liên kết Fanpage đã kết nối tài khoản Instagram chuyên nghiệp.' : 'Tại developers.facebook.com tạo ứng dụng loại Business, thêm sản phẩm Messenger và liên kết Fanpage.'}</li><li>Dán App Secret, ID và Page access token ở trên rồi bấm Lưu.</li><li>{platform === 'instagram' ? 'Trong Webhooks, chọn đối tượng Instagram, dán Callback URL và Verify token phía trên, bấm Xác minh và lưu, rồi đăng ký trường “messages”.' : 'Trong Webhooks, chọn đối tượng Page, dán Callback URL và Verify token phía trên, bấm Xác minh và lưu, rồi đăng ký trường “messages”.'}</li><li>Meta chỉ cho phép trả lời trong 24 giờ kể từ tin nhắn cuối của khách. Ứng dụng cần được duyệt quyền (App Review) để nhận tin từ khách bên ngoài nhóm kiểm thử.</li></ol>
    : platform === 'zalo' ? <ol className="dk-steps"><li>Tạo ứng dụng tại developers.zalo.me và liên kết với Official Account của bạn.</li><li>Dán App ID, OA ID, Secret key, Access token và Refresh token ở trên rồi bấm Lưu.</li><li>Trong Zalo Developers → Webhook, dán Webhook URL phía trên và bật sự kiện “Người dùng gửi tin nhắn văn bản”.</li><li>Zalo chỉ cho phép trả lời trong 48 giờ kể từ tin nhắn cuối của khách.</li></ol>
      : <ol className="dk-steps"><li>Nhập thông tin gửi (SMTP hoặc Resend) rồi bấm Lưu. Gmail cần bật xác minh 2 bước và tạo “Mật khẩu ứng dụng”.</li><li>Nhận email: thiết lập chuyển tiếp thư tới địa chỉ webhook phía trên bằng Postmark Inbound, Mailgun Routes hoặc dịch vụ tương tự (định dạng JSON hoặc form).</li><li>Mỗi người gửi trở thành một hội thoại; trả lời trong Hộp thư sẽ gửi email kèm tiêu đề “Re: …”.</li></ol>}
  </section>;
}

export default function Messaging() {
  const { data } = useWorkspace(); const [accounts, setAccounts] = useState<ChannelAccount[] | null>(null); const [error, setError] = useState('');
  const load = useCallback(async () => { try { setAccounts(await channelAccounts('status') as ChannelAccount[]); setError(''); } catch (cause) { setError(errorMessage(cause)); } }, []);
  useEffect(() => { void load(); }, [load]);
  const manage = data?.capabilities.role === 'owner' || data?.capabilities.role === 'manager';
  return <>
    <PageHeader title="Kênh nhắn tin" description="Nhận và trả lời tin nhắn Zalo OA, Facebook Messenger, Instagram, WhatsApp, TikTok và email ngay trong Hộp thư." />
    {!manage ? <div className="mk-alert">Chỉ chủ không gian và quản lý được cấu hình kênh nhắn tin.</div> : <>
      {error && <div className="mk-alert error" role="alert">{error}</div>}
      {!apiOrigin() && <div className="mk-alert"><span className="mk-dot amber" />Hãy nhập Máy chủ API (địa chỉ website Maoki đã triển khai) ở trang Giao diện & ngôn ngữ để gửi tin và lấy địa chỉ webhook.</div>}
      {accounts && (['zalo', 'facebook', 'instagram', 'whatsapp', 'tiktok', 'email', 'phone', 'google', 'youtube'] as const).map(platform => <Account key={platform} platform={platform} account={accounts.find(item => item.platform === platform)} reloadAccounts={load} origin={apiOrigin()} />)}</>}
  </>;
}
