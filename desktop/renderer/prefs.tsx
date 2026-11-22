import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ui } from './i18n/ui';
import type { Lang, UiKey } from './i18n/ui';
import { startTranslator } from './i18n/translate';

export const ACCENTS = ['blue', 'indigo', 'teal', 'green', 'amber', 'rose', 'graphite'] as const;
export type Accent = (typeof ACCENTS)[number];
const LANG_KEY = 'maoki:desktop-lang'; const ACCENT_KEY = 'maoki:desktop-accent';

const read = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* kept for this session */ } };

interface Prefs { lang: Lang; setLang: (lang: Lang) => void; accent: Accent; setAccent: (accent: Accent) => void; t: (key: UiKey, vars?: Record<string, string | number>) => string }
const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => { const saved = read(LANG_KEY); return saved === 'en' || saved === 'vi' ? saved : navigator.language.toLowerCase().startsWith('en') ? 'en' : 'vi'; });
  const [accent, setAccentState] = useState<Accent>(() => { const saved = read(ACCENT_KEY) as Accent | null; return saved && ACCENTS.includes(saved) ? saved : 'blue'; });
  const setLang = useCallback((value: Lang) => { setLangState(value); write(LANG_KEY, value); }, []);
  const setAccent = useCallback((value: Accent) => { setAccentState(value); write(ACCENT_KEY, value); }, []);

  useEffect(() => { const root = document.documentElement; root.dataset.mkDesktop = ''; root.dataset.mkAccent = accent; }, [accent]);
  useEffect(() => { document.documentElement.lang = lang; document.title = ui[lang].appName; return startTranslator(lang); }, [lang]);

  const t = useCallback((key: UiKey, vars?: Record<string, string | number>) => {
    let text: string = ui[lang][key] ?? ui.vi[key] ?? key;
    if (vars) for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, accent, setAccent, t }), [lang, setLang, accent, setAccent, t]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}
export function usePrefs() { const value = useContext(PrefsContext); if (!value) throw new Error('PrefsProvider is required'); return value; }
