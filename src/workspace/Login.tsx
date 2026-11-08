import Brand from './Brand';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { FiArrowRight, FiGrid, FiArrowLeft, FiShield, FiCheck, FiInfo, FiLock } from 'react-icons/fi';
import { requireSupabase, databaseError } from '../lib/supabase/client';
import { useSession } from './Session';
import { Button } from './ui';
import { errorMessage } from './utils';
import './workspace.css';
import './zones.css';

export default function Login() {
  const navigate = useNavigate(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const { user, loading, demoAvailable, startDemo, selectPrimary } = useSession(); const [params] = useSearchParams(); const invite = params.get('invite');
  const [register, setRegister] = useState(false); const [notice, setNotice] = useState('');
  const login = async (demo = false) => {
    setBusy(true); setError('');
    try {
      if (demo) await startDemo();
      else {
        const client = requireSupabase();
        if (register) {
          const redirect = new URL('/admin', window.location.origin); if (invite) redirect.searchParams.set('invite', invite);
          const result = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirect.toString() } });
          if (result.error) throw result.error;
          if (!result.data.session) { setNotice('Kiểm tra email để xác nhận tài khoản, rồi đăng nhập tại đây.'); return; }
        } else { const { error } = await client.auth.signInWithPassword({ email, password }); if (error) throw error; }
        if (invite) { const { error } = await client.rpc('maoki_workspace', { op: 'accept_invite', payload: { token: invite } }); if (error) throw databaseError(error); }
        selectPrimary();
      }
      navigate('/admin/dashboard');
    } catch (cause) {
      const message = errorMessage(cause);
      if (/email not confirmed/i.test(message)) { setError('Vui lòng xác nhận email trước khi đăng nhập.'); return; }
      if (/fetch|network|timeout/i.test(message)) { setError('Chưa kết nối được Supabase. Vui lòng kiểm tra mạng và thử lại.'); return; }
      setError(message.includes('auth/invalid') || message.includes('auth/user-not-found') || message.includes('auth/wrong-password') || message.toLowerCase().includes('invalid login credentials') ? 'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.' : message);
    } finally { setBusy(false); }
  };
  // Staff who are already signed in go straight to the admin console.
  if (!loading && user && !invite && !busy) return <Navigate to="/admin/dashboard" replace />;
  return <div className="maoki-ui mk-zone-admin mk-admin-login">
    <section className="mk-admin-login-story">
      <div className="mk-admin-login-top"><Brand to="/admin" tagline="" /><span className="mk-admin-badge"><FiShield />Khu vực quản trị</span></div>
      <div>
        <span className="mk-admin-eyebrow">MAOKIHOUSE ADMIN CONSOLE</span>
        <h1>Bảng điều hành<br />dành cho đội ngũ.</h1>
        <p>Quản lý phòng, đặt phòng, hộp thư khách, công việc và doanh thu. Chỉ chủ nhà và nhân viên được mời mới có quyền truy cập.</p>
        <ul className="mk-admin-login-points">
          <li><FiCheck />Phân quyền theo vai trò: chủ không gian, quản lý, nhân viên, chỉ xem</li>
          <li><FiCheck />Mọi thay đổi được ghi lại trong nhật ký hoạt động</li>
          <li><FiCheck />Dữ liệu khách được bảo vệ bằng phân quyền phía máy chủ</li>
        </ul>
      </div>
      <small>MaokiHouse · Hệ thống nội bộ</small>
    </section>
    <section className="mk-login-form-wrap">
      <div className="mk-login-form">
        <div className="mk-admin-guest-notice" role="note"><FiInfo /><div><strong>Bạn là khách muốn đặt phòng?</strong><span>Bạn không cần tài khoản. <Link to="/#stays">Xem phòng và đặt ngay</Link></span></div></div>
        <span className="mk-admin-eyebrow">{register ? 'TẠO TÀI KHOẢN QUẢN TRỊ' : 'ĐĂNG NHẬP QUẢN TRỊ'}</span>
        <h2>{register ? 'Tạo tài khoản quản lý' : 'Đăng nhập nhân viên'}</h2>
        <p>{register ? 'Dùng email công việc. Nếu được mời, hãy dùng đúng email nhận lời mời.' : 'Dùng email và mật khẩu được cấp cho đội ngũ MaokiHouse.'}</p>
        {notice && <div className="mk-alert" role="status">{notice}</div>}{invite && <div className="mk-alert">Đăng nhập bằng email được mời để tham gia không gian.</div>}{error && <div className="mk-alert error" role="alert">{error}</div>}
        <form onSubmit={event => { event.preventDefault(); void login(); }}>
          <label className="mk-field" htmlFor="login-email">Email công việc<input id="login-email" type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="ten@maokihouse.vn" /></label>
          <label className="mk-field" htmlFor="login-password">Mật khẩu<input id="login-password" type="password" required minLength={register ? 8 : undefined} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Nhập mật khẩu của bạn" /></label>
          <Button kind="primary" type="submit" busy={busy}><FiLock />{register ? 'Tạo tài khoản quản trị' : 'Vào trang quản trị'}<FiArrowRight /></Button>
        </form>
        <button className="mk-text-button" disabled={busy} onClick={() => { setRegister(value => !value); setError(''); setNotice(''); }}>{register ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Tạo tài khoản quản lý'}</button>
        {demoAvailable && <><div className="mk-login-divider">hoặc khám phá trước</div><Button busy={busy} onClick={() => void login(true)}><FiGrid />Mở trang quản trị demo</Button><small className="mk-login-demo-note">Dữ liệu mẫu được lưu trong môi trường thử nghiệm riêng. Không kết nối tài khoản hoặc gửi tin nhắn bên ngoài.</small></>}
        <div className="mk-admin-login-footer"><Link to="/" className="mk-text-button"><FiArrowLeft />Về website khách</Link><Link className="mk-subtle-link" to="/setup">Thiết lập Supabase &amp; AI</Link></div>
      </div>
    </section>
  </div>;
}
