import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FiArrowRight, FiFeather, FiGrid, FiArrowLeft } from 'react-icons/fi';
import { requireSupabase, databaseError } from '../lib/supabase/client';
import { useSession } from './Session';
import { Button } from './ui';
import { errorMessage } from './utils';
import './workspace.css';

export default function Login() {
  const navigate = useNavigate(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const { demoAvailable, startDemo, selectPrimary } = useSession(); const [params] = useSearchParams(); const invite = params.get('invite');
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
  return <div className="maoki-ui mk-login"><section className="mk-login-story"><Link to="/" className="mk-brand"><span className="mk-logo"><FiFeather /></span><span>maoki.<small>HOSPITALITY WORKSPACE</small></span></Link><div><h1>Vận hành nhẹ hơn.<br />Kết nối gần hơn.</h1><p>Từ mỗi căn phòng đến từng lời nhắn. Một không gian để đội ngũ của bạn chăm chút những kỳ nghỉ đáng nhớ.</p></div><small>MaokiHouse · Chăm chút từng kỳ nghỉ</small></section><section className="mk-login-form-wrap"><div className="mk-login-form"><Link to="/" className="mk-text-button"><FiArrowLeft />Về website</Link><h2>Chào mừng trở lại.</h2><p>Đăng nhập để bắt đầu một ngày đón khách thật tốt.</p>{notice && <div className="mk-alert" role="status">{notice}</div>}{invite && <div className="mk-alert">Đăng nhập bằng email được mời để tham gia không gian.</div>}{error && <div className="mk-alert error" role="alert">{error}</div>}<form onSubmit={event => { event.preventDefault(); void login(); }}><label className="mk-field" htmlFor="login-email">Email<input id="login-email" type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="ban@maokihouse.vn" /></label><label className="mk-field" htmlFor="login-password">Mật khẩu<input id="login-password" type="password" required minLength={register ? 8 : undefined} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Nhập mật khẩu của bạn" /></label><Button kind="primary" type="submit" busy={busy}>{register ? 'Tạo tài khoản' : 'Đăng nhập'}<FiArrowRight /></Button></form><button className="mk-text-button" disabled={busy} onClick={() => { setRegister(value => !value); setError(''); setNotice(''); }}>{register ? 'Đã có tài khoản? Đăng nhập' : 'Tạo tài khoản quản lý'}</button>{demoAvailable && <><div className="mk-login-divider">hoặc khám phá trước</div><Button busy={busy} onClick={() => void login(true)}><FiGrid />Mở không gian demo</Button><small className="mk-login-demo-note">Dữ liệu mẫu được lưu trong môi trường thử nghiệm riêng. Không kết nối tài khoản hoặc gửi tin nhắn bên ngoài.</small></>}</div></section></div>;
}
