import { useEffect, useState } from 'react';
import { FiDownload, FiShare, FiSmartphone, FiX } from 'react-icons/fi';
import { Button } from './ui';

interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
const DISMISS_KEY = 'maoki:install-hint-hidden';

// Android/Chrome fires this once; keep it for whichever component asks later.
let deferred: InstallPromptEvent | null = null;
if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferred = event as InstallPromptEvent; });

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Explains how to open the admin as an installed app (full screen, no browser address bar).
 * `banner`: dismissible hint shown on phones; otherwise a permanent panel for Settings.
 */
export default function InstallApp({ banner = false }: { banner?: boolean }) {
  const [canPrompt, setCanPrompt] = useState(Boolean(deferred));
  const [installed, setInstalled] = useState(isStandalone);
  const [hidden, setHidden] = useState(() => { try { return window.localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } });
  useEffect(() => {
    const ready = (event: Event) => { event.preventDefault(); deferred = event as InstallPromptEvent; setCanPrompt(true); };
    const done = () => { setInstalled(true); deferred = null; };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', ready); window.removeEventListener('appinstalled', done); };
  }, []);
  const ios = isIOS();
  const phone = window.matchMedia('(max-width: 850px)').matches;
  if (banner && (installed || hidden || !phone || (!ios && !canPrompt))) return null;
  const install = async () => { if (!deferred) return; await deferred.prompt(); const { outcome } = await deferred.userChoice; if (outcome === 'accepted') setInstalled(true); deferred = null; setCanPrompt(false); };
  const body = installed
    ? <p>MaokiHouse đang chạy như ứng dụng trên thiết bị này.</p>
    : ios
      ? <ol className="mk-install-steps"><li>Mở trang này bằng <strong>Safari</strong>.</li><li>Bấm nút <strong>Chia sẻ</strong> <FiShare aria-label="biểu tượng Chia sẻ" /> ở thanh dưới cùng.</li><li>Chọn <strong>Thêm vào MH chính</strong> rồi bấm <strong>Thêm</strong>.</li></ol>
      : canPrompt
        ? <p>Cài MaokiHouse lên màn hình chính để mở toàn màn hình, không có thanh địa chỉ trình duyệt.</p>
        : <p>Trên điện thoại Android, mở trang này bằng Chrome rồi chọn menu <strong>⋮ → Cài đặt ứng dụng</strong> (hoặc <strong>Thêm vào màn hình chính</strong>). Trên iPhone dùng Safari → Chia sẻ → Thêm vào MH chính.</p>;
  return <section className={banner ? 'mk-install-banner' : 'mk-panel mk-settings-panel mk-install-panel'} aria-label="Cài ứng dụng MaokiHouse">
    <div className="mk-install-head"><FiSmartphone aria-hidden="true" /><strong>{installed ? 'Đã cài ứng dụng' : 'Dùng như ứng dụng trên điện thoại'}</strong>
      {banner && <button type="button" className="mk-icon-button" aria-label="Ẩn hướng dẫn cài ứng dụng" onClick={() => { setHidden(true); try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch { /* not persisted */ } }}><FiX /></button>}</div>
    {body}
    {!installed && !ios && canPrompt && <Button kind="primary" onClick={() => void install()}><FiDownload />Cài ứng dụng</Button>}
  </section>;
}
