import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiCheck } from 'react-icons/fi';
import { PageHeader, SectionTitle, Button, Badge } from '../../src/workspace/ui';
import { useAdminTheme } from '../../src/workspace/theme';
import type { ThemePreference } from '../../src/workspace/theme';
import { API_ORIGIN_KEY, apiOrigin } from '../../src/workspace/apiBase';
import { ACCENTS, usePrefs } from './prefs';
import { NOTIFY_KEY, notificationsEnabled } from './Shell';
import type { UiKey } from './i18n/ui';

declare global { interface Window { maokiDesktop?: { info: () => Promise<{ version: string; platform: string }>; setThemeSource: (value: ThemePreference) => Promise<void>; openExternal: (url: string) => Promise<void> } } }

export default function Preferences() {
  const { t, lang, setLang, accent, setAccent } = usePrefs();
  const { preference, setPreference } = useAdminTheme();
  const [server, setServer] = useState(apiOrigin());
  const [notify, setNotify] = useState(notificationsEnabled());
  const toggleNotify = () => { const next = !notify; setNotify(next); try { window.localStorage.setItem(NOTIFY_KEY, next ? 'on' : 'off'); } catch { /* not persisted */ } if (next && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission(); };
  const [info, setInfo] = useState<{ version: string; platform: string } | null>(null);
  useEffect(() => { void window.maokiDesktop?.info().then(setInfo).catch(() => undefined); }, []);
  // Keep native window chrome (title bar, scrollbars, dialogs) in step with the chosen mode.
  const choose = (value: ThemePreference) => { setPreference(value); void window.maokiDesktop?.setThemeSource(value); };
  const saveServer = () => {
    const value = server.trim().replace(/\/+$/, '');
    if (value && !/^https:\/\/[^\s/]+|^http:\/\/localhost(:\d+)?$/.test(value)) { toast.error(t('pref.serverBad')); return; }
    try { if (value) window.localStorage.setItem(API_ORIGIN_KEY, value); else window.localStorage.removeItem(API_ORIGIN_KEY); } catch { /* not persisted */ }
    toast.success(t('pref.serverSaved'));
  };
  const modes: [ThemePreference, UiKey, UiKey][] = [['system', 'pref.system', 'pref.systemD'], ['light', 'pref.light', 'pref.lightD'], ['dark', 'pref.dark', 'pref.darkD']];
  return <>
    <PageHeader title={t('pref.title')} description={t('pref.desc')} />
    <section className="mk-panel dk-pref"><SectionTitle title={t('pref.appearance')} />
      <div className="dk-choice-grid" role="radiogroup" aria-label={t('pref.appearance')}>{modes.map(([value, label, hint]) => <button key={value} type="button" role="radio" aria-checked={preference === value} className={`dk-choice ${preference === value ? 'on' : ''}`} onClick={() => choose(value)}><span className={`dk-mode-swatch ${value}`} aria-hidden="true" /><strong>{t(label)}{preference === value && <FiCheck aria-hidden="true" />}</strong><small>{t(hint)}</small></button>)}</div>
    </section>
    <section className="mk-panel dk-pref"><SectionTitle title={t('pref.accent')} /><p className="dk-hint">{t('pref.accentD')}</p>
      <div className="dk-swatches" role="radiogroup" aria-label={t('pref.accent')}>{ACCENTS.map(value => <button key={value} type="button" role="radio" aria-checked={accent === value} className={`dk-swatch ${accent === value ? 'on' : ''}`} data-accent={value} onClick={() => setAccent(value)}><span aria-hidden="true">{accent === value && <FiCheck />}</span>{t(`accent.${value}` as UiKey)}</button>)}</div>
      <div className="dk-preview"><strong>{t('pref.preview')}</strong><p>{t('pref.previewText')}</p><div><Button kind="primary">{t('pref.sample')}</Button><Badge value="confirmed">{t('pref.sampleBadge')}</Badge></div></div>
    </section>
    <section className="mk-panel dk-pref"><SectionTitle title={t('pref.language')} /><p className="dk-hint">{t('pref.languageD')}</p>
      <div className="dk-choice-grid two" role="radiogroup" aria-label={t('pref.language')}>{([['vi', 'Tiếng Việt', 'Vietnamese'], ['en', 'English', 'Tiếng Anh']] as const).map(([code, name, other]) => <button key={code} type="button" role="radio" aria-checked={lang === code} className={`dk-choice ${lang === code ? 'on' : ''}`} onClick={() => setLang(code)}><strong>{name}{lang === code && <FiCheck aria-hidden="true" />}</strong><small>{other}</small></button>)}</div>
    </section>
    <section className="mk-panel dk-pref"><SectionTitle title={t('pref.notify')} /><p className="dk-hint">{t('pref.notifyD')}</p><Button kind={notify ? 'secondary' : 'primary'} onClick={toggleNotify}>{t(notify ? 'pref.notifyOff' : 'pref.notifyOn')}</Button></section>
    <section className="mk-panel dk-pref"><SectionTitle title={t('pref.server')} /><p className="dk-hint">{t('pref.serverD')}</p>
      <div className="dk-inline"><input aria-label={t('pref.server')} placeholder="https://…" value={server} onChange={event => setServer(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') saveServer(); }} /><Button kind="primary" onClick={saveServer}>{t('pref.serverSave')}</Button></div>
    </section>
    <section className="mk-panel dk-pref"><SectionTitle title={t('pref.about')} /><dl className="dk-about"><div><dt>{t('pref.version')}</dt><dd>{info?.version || '—'}</dd></div><div><dt>{t('pref.platform')}</dt><dd>{info?.platform || 'web'}</dd></div></dl></section>
  </>;
}
