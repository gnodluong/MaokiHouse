import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiCheckCircle, FiCopy, FiDownload, FiExternalLink } from 'react-icons/fi';
import Brand from './Brand';
import { Button } from './ui';
import { requireSupabase } from '../lib/supabase/client';
import { bootstrapSQL, upgradeSQL } from '../../shared/supabase-bootstrap.mjs';
import migration from '../../supabase/migrations/20261017131312_maoki_workspace.sql?raw';
import channelMigration from '../../supabase/migrations/20261018085535_maoki_channel_calendars.sql?raw';
import aiMigration from '../../supabase/migrations/20261108120000_maoki_calendars_ai.sql?raw';
import './workspace.css';

// Both upgrades are idempotent: an already-applied, unchanged migration is skipped.
const upgrade = upgradeSQL('20261018085535', 'maoki_channel_calendars', channelMigration) + '\n\n' + upgradeSQL('20261108120000', 'maoki_calendars_ai', aiMigration);
const initial = bootstrapSQL('20261017131312', 'maoki_workspace', migration) + '\n\n' + upgrade;
const dashboard = 'https://supabase.com/dashboard/project/msucrkkxuplgijxanzxu';
const site = 'https://maokihousemvc.vercel.app';
export default function Setup() {
  const [params] = useSearchParams(); const [sqlMode, setSQLMode] = useState(['channels', 'upgrade'].includes(params.get('mode') || '') ? 'channels' : 'initial');
  const sql = sqlMode === 'channels' ? upgrade : initial;
  const [copied, setCopied] = useState(false); const [checking, setChecking] = useState(false); const [status, setStatus] = useState(''); const [ready, setReady] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(sql); setCopied(true); } catch { setStatus('Không sao chép tự động được. Mở “Xem SQL” bên dưới, chọn toàn bộ rồi sao chép.'); } };
  const download = () => { const url = URL.createObjectURL(new Blob([sql], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'maokihouse-setup.sql'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const check = async () => {
    setChecking(true); setReady(false);
    try {
      const { error } = await requireSupabase().rpc('maoki_public', { op: 'list', record_id: null, token: '', payload: {} });
      if (error) { setStatus(['PGRST202', 'PGRST205', '42883'].includes(error.code) ? 'Chưa thấy cấu trúc MaokiHouse. Hoàn thành bước 1 rồi kiểm tra lại.' : 'Chưa xác minh được kết nối hoặc quyền dữ liệu. Kiểm tra kết quả SQL và thử lại.'); return; }
      const channels = await requireSupabase().rpc('maoki_calendar_feed', { feed_token: '' });
      const ai = await requireSupabase().rpc('maoki_ai_settings', { op: 'status', payload: {} });
      if (channels.error || ai.error?.code === 'PGRST202') { setStatus('Dữ liệu cơ bản đã có. Chọn “Cập nhật” và chạy SQL để bật lịch mọi kênh và lưu API key AI.'); return; }
      setReady(true); setStatus('Đã kết nối được dữ liệu MaokiHouse, lịch iCal và cài đặt AI. Tiếp tục cấu hình đăng nhập và tạo tài khoản bên dưới.');
    } catch { setStatus('Chưa truy cập được Supabase. Kiểm tra mạng rồi thử lại.'); }
    finally { setChecking(false); }
  };
  return <div className="maoki-ui mk-public"><header className="mk-public-header"><Brand /><Link className="mk-subtle-link" to="/admin">Về đăng nhập</Link></header><main className="mk-setup"><span className="mk-eyebrow">THIẾT LẬP MỘT LẦN</span><h1>Đưa MaokiHouse vào sử dụng.</h1><p>Bạn chỉ cần mở Dashboard Supabase và làm lần lượt các bước dưới đây. Không cần terminal, access token hay mật khẩu database trong trang này.</p>
    <section className="mk-panel mk-setup-step"><span className="mk-eyebrow">BƯỚC 1 · TẠO CẤU TRÚC DỮ LIỆU</span><h2>Sao chép SQL, mở SQL Editor và nhấn Run.</h2><div className="mk-segment"><button aria-pressed={sqlMode === 'initial'} className={sqlMode === 'initial' ? 'selected' : ''} onClick={() => { setSQLMode('initial'); setCopied(false); }}>Lần đầu thiết lập</button><button aria-pressed={sqlMode === 'channels'} className={sqlMode === 'channels' ? 'selected' : ''} onClick={() => { setSQLMode('channels'); setCopied(false); }}>Cập nhật (lịch &amp; AI)</button></div><p>{sqlMode === 'channels' ? 'Dành cho website đã có dữ liệu MaokiHouse: bổ sung lịch mọi kênh và cài đặt AI, giữ nguyên phòng và đặt phòng. Chạy lại an toàn: phần đã cập nhật sẽ được bỏ qua.' : 'Dành cho dự án mới: tạo cấu trúc ban đầu và bổ sung lịch iCal. Nếu đã thiết lập, chọn Cập nhật.'}</p><ol><li>Nhấn <strong>Sao chép SQL</strong> bên dưới.</li><li>Mở SQL Editor của dự án, chọn <strong>New query</strong>.</li><li>Dán toàn bộ SQL, chọn role <strong>postgres</strong> nếu có bộ chọn, rồi nhấn <strong>Run</strong>. Chờ thông báo thành công.</li></ol><p>SQL tạo bảng và quyền truy cập, chưa nhập dữ liệu Firebase cũ. Chỉ chạy một lần. Nếu thấy “already applied” hoặc “already exists”, dừng và kiểm tra; không xóa bảng hay chạy lại liên tục.</p><div className="mk-inline-actions"><Button kind="primary" onClick={() => void copy()}><FiCopy />{copied ? 'Đã sao chép SQL' : 'Sao chép SQL'}</Button><a className="mk-button" href={dashboard + '/sql/new'} target="_blank" rel="noreferrer"><FiExternalLink />Mở SQL Editor</a><Button onClick={download}><FiDownload />Tải file SQL</Button></div><details><summary>Xem SQL để sao chép thủ công</summary><textarea aria-label="SQL thiết lập MaokiHouse" readOnly value={sql} rows={12} onFocus={event => event.currentTarget.select()} /></details><Button busy={checking} onClick={() => void check()}><FiCheckCircle />Kiểm tra dữ liệu</Button>{status && <p className={`mk-alert ${ready ? '' : 'error'}`} role="status">{status}</p>}</section>
    <section className="mk-panel mk-setup-step"><span className="mk-eyebrow">BƯỚC 2 · ĐƯỜNG DẪN ĐĂNG NHẬP</span><h2>Cấu hình website trong Supabase Auth.</h2><p>Mở URL Configuration, đặt <strong>Site URL</strong> thành:</p><code>{site}</code><p>Thêm cả hai địa chỉ sau vào <strong>Redirect URLs</strong>, rồi nhấn <strong>Save changes</strong>:</p><code>{site}/admin<br />{site}/admin?invite=*</code><a className="mk-button" href={dashboard + '/auth/url-configuration'} target="_blank" rel="noreferrer"><FiExternalLink />Mở URL Configuration</a></section>
    <section className="mk-panel mk-setup-step"><span className="mk-eyebrow">BƯỚC 3 · TÀI KHOẢN CHỦ KHÔNG GIAN</span><h2>Tạo tài khoản và đăng nhập.</h2><ol><li>Mở <strong>Authentication → Users → Add user → Create new user</strong>.</li><li>Nhập email <strong>maokihouse.sg@gmail.com</strong> và mật khẩu bạn chọn; bật <strong>Auto Confirm User</strong>, rồi tạo tài khoản. Nếu email đã tồn tại, dùng tài khoản đó.</li><li>Về trang đăng nhập MaokiHouse. Tài khoản mới chưa thuộc không gian nào sẽ được tạo không gian riêng với quyền <strong>Chủ không gian</strong> khi mở dashboard.</li></ol><div className="mk-inline-actions"><a className="mk-button" href={dashboard + '/auth/users'} target="_blank" rel="noreferrer"><FiExternalLink />Mở danh sách tài khoản</a><Link className="mk-button primary" to="/admin">Đăng nhập MaokiHouse</Link></div></section>
    <section id="ai" className="mk-panel mk-setup-step"><span className="mk-eyebrow">BƯỚC 4 · BẬT TRỢ LÝ AI</span><h2>Dán API key OpenRouter ngay trong trang quản trị.</h2><ol><li>Tạo tài khoản tại <a className="mk-subtle-link" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a> và bấm <strong>Create Key</strong>. Nên đặt giới hạn chi tiêu (credit limit) cho key.</li><li>Đăng nhập MaokiHouse, mở <strong>Trợ lý AI → Cài đặt AI</strong>, dán key (bắt đầu bằng <code>sk-or-</code>) rồi bấm <strong>Lưu và kiểm tra</strong>.</li><li>Model mặc định là <code>nvidia/nemotron-3.5-super-vl:free</code> (miễn phí, có giới hạn lượt dùng). Có thể đổi model trong cùng màn hình.</li></ol><p>Key được lưu trong Supabase ở bảng riêng, không bao giờ gửi về trình duyệt; chỉ chủ không gian và quản lý được đặt key. Nếu muốn giữ key hoàn toàn ngoài database, đặt biến <code>OPENROUTER_API_KEY</code> trên Vercel (Production) rồi Redeploy — key trên Vercel được ưu tiên.</p></section>
  </main><footer className="mk-public-footer">MaokiHouse · Chăm chút từng kỳ nghỉ</footer></div>;
}
