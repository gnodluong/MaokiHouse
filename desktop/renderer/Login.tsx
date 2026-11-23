import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { FiArrowRight, FiCheck, FiMoon, FiSun } from 'react-icons/fi';
import { requireSupabase, databaseError } from '../../src/lib/supabase/client';
import { useSession } from '../../src/workspace/Session';
import { Button } from '../../src/workspace/ui';
import { errorMessage } from '../../src/workspace/utils';
import { useAdminTheme } from '../../src/workspace/theme';
import { usePrefs } from './prefs';

export default function Login() {
  const { t, lang, setLang } = usePrefs();
  const navigate = useNavigate(); const [params] = useSearchParams(); const invite = params.get('invite');
  const { user, loading, selectPrimary } = useSession();
  const { resolved, setPreference } = useAdminTheme(true);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setNotice('');
    if (register && password.length < 8) { setError(t('login.minPassword')); return; }
    setBusy(true);
    try {
      const client = requireSupabase();
      if (register) {
        const result = await client.auth.signUp({ email, password });
        if (result.error) throw result.error;
        if (!result.data.session) { setNotice(t('login.checkEmail')); return; }
      } else { const { error: failure } = await client.auth.signInWithPassword({ email, password }); if (failure) throw failure; }
      if (invite) { const { error: failure } = await client.rpc('maoki_workspace', { op: 'accept_invite', payload: { token: invite } }); if (failure) throw databaseError(failure); }
      selectPrimary(); navigate('/admin/dashboard');
    } catch (cause) {
      const message = errorMessage(cause);
      if (/email not confirmed/i.test(message)) setError(t('login.errConfirm'));
      else if (/fetch|network|timeout/i.test(message)) setError(t('login.errNetwork'));
      else if (/invalid login credentials/i.test(message)) setError(t('login.errCreds'));
      else setError(message);
    } finally { setBusy(false); }
  };
  if (!loading && user && !invite && !busy) return <Navigate to="/admin/dashboard" replace />;
  return <div className="maoki-ui mk-zone-admin dk-login">
    <section className="dk-login-story">
      <div className="dk-brand"><span className="dk-wordmark" role="img" aria-label="Maoki House" /><small>Admin</small></div>
      <div><h1>{t('login.title')}</h1><p>{t('login.lead')}</p>
        <ul>{(['login.p1', 'login.p2', 'login.p3'] as const).map(key => <li key={key}><FiCheck aria-hidden="true" />{t(key)}</li>)}</ul></div>
      <small>{t('login.footer')}</small>
    </section>
    <section className="dk-login-form-wrap">
      <div className="dk-login-tools">
        <div className="dk-lang" role="group" aria-label={t('language')}>{(['vi', 'en'] as const).map(code => <button key={code} type="button" className={lang === code ? 'on' : ''} aria-pressed={lang === code} onClick={() => setLang(code)}>{code.toUpperCase()}</button>)}</div>
        <button className="mk-icon-button" type="button" aria-label={resolved === 'dark' ? t('themeToLight') : t('themeToDark')} onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}>{resolved === 'dark' ? <FiSun /> : <FiMoon />}</button>
      </div>
      <form className="dk-login-form" onSubmit={event => void submit(event)} noValidate={false}>
        <div className="dk-tabs" role="tablist">{[false, true].map(value => <button key={String(value)} type="button" role="tab" aria-selected={register === value} className={register === value ? 'on' : ''} onClick={() => { setRegister(value); setError(''); setNotice(''); }}>{t(value ? 'login.signup' : 'login.signin')}</button>)}</div>
        {invite && <p className="mk-alert">{t('login.invite')}</p>}
        <label className="mk-field"><span>{t('login.email')}</span><input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label className="mk-field"><span>{t('login.password')}</span><input type="password" autoComplete={register ? 'new-password' : 'current-password'} required value={password} onChange={event => setPassword(event.target.value)} /></label>
        {error && <p className="mk-alert error" role="alert">{error}</p>}{notice && <p className="mk-alert" role="status">{notice}</p>}
        <Button kind="primary" type="submit" busy={busy}>{t(register ? 'login.submitUp' : 'login.submitIn')}<FiArrowRight aria-hidden="true" /></Button>
        <Link className="mk-subtle-link" to="/setup">{t('login.setup')}</Link>
      </form>
    </section>
  </div>;
}
