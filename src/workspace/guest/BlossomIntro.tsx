import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import { buildSprites, drawBloom, layoutSpiral, paintPaper } from './blossomPainter';

const SEEN_KEY = 'maoki:blossom-intro-seen';
const BLOOM_MS = 3800; // spiral swirls open
const HOLD_MS = 700; // let the finished picture breathe
const EXIT_MS = 1300; // paper iris opens onto the site
const REDUCED_HOLD_MS = 1500;

const BEHIND = ['.mk-skip', '.mk-guest-header', '#guest-main', '.mk-guest-footer'];

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

function alreadySeen(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode: the intro simply replays next visit */
  }
}

/**
 * Opening scene for the guest home page: sakura blossoms, painted in
 * watercolor on aged paper, whirl out of the centre and open; then the
 * paper dissolves in an expanding iris onto the site. Plays once per tab
 * session, never on deep links, and is a still frame under reduced motion.
 */
export default function BlossomIntro() {
  const { pathname, hash } = useLocation();
  const [active, setActive] = useState(() => pathname === '/' && !hash && !alreadySeen() && !document.hidden);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skipRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const g = canvas.getContext('2d');
    if (!g) {
      markSeen();
      setActive(false);
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const sprites = buildSprites(dpr);

    // Keep the page behind out of reach of keyboard and screen readers while the scene plays.
    const behind = BEHIND.flatMap(sel => Array.from(document.querySelectorAll<HTMLElement>(sel)));
    behind.forEach(el => el.setAttribute('inert', ''));
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    let width = 0;
    let height = 0;
    let paper: HTMLCanvasElement | null = null;
    let layout = layoutSpiral(1, 1);
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      paper = paintPaper(canvas.width, canvas.height);
      layout = layoutSpiral(width, height);
    };
    resize();

    let raf = 0;
    let startedAt = 0;
    let exitAt = reduced ? 0 : -1; // -1 = still blooming
    let frozenT = 1;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      markSeen();
      behind.forEach(el => el.removeAttribute('inert'));
      document.documentElement.style.overflow = prevOverflow;
      setActive(false);
    };

    const setMask = (p: number) => {
      const reach = Math.hypot(width, height) / 2 + 60;
      const r = p * reach;
      const mask = `radial-gradient(circle at 50% 50%, transparent ${r}px, #000 ${r + reach * 0.16}px)`;
      root.style.maskImage = mask;
      root.style.setProperty('-webkit-mask-image', mask);
    };

    const beginExit = (now: number, t: number) => {
      if (exitAt >= 0) return;
      exitAt = now;
      frozenT = t;
    };
    skipRef.current = () => beginExit(performance.now(), Math.min(1, (performance.now() - startedAt) / BLOOM_MS));

    const draw = (now: number) => {
      if (!startedAt) startedAt = now;
      if (window.innerWidth !== width || window.innerHeight !== height) resize();

      let t: number;
      if (reduced) {
        t = 1;
      } else if (exitAt < 0) {
        const elapsed = now - startedAt;
        t = Math.min(1, elapsed / BLOOM_MS);
        if (elapsed >= BLOOM_MS + HOLD_MS) beginExit(now, 1);
      } else {
        t = frozenT;
      }

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      if (paper) g.drawImage(paper, 0, 0);
      drawBloom(g, layout, sprites, t, width / 2, height / 2, dpr);

      if (reduced) {
        if (!exitAt) exitAt = now;
        const p = Math.min(1, Math.max(0, (now - exitAt - REDUCED_HOLD_MS) / 500));
        root.style.opacity = String(1 - p);
        if (p >= 1) return finish();
      } else if (exitAt >= 0) {
        const p = Math.min(1, (now - exitAt) / EXIT_MS);
        setMask(easeInOutCubic(p));
        root.style.opacity = String(1 - Math.max(0, p - 0.85) / 0.15);
        const title = root.querySelector<HTMLElement>('.mk-blossom-title');
        if (title) title.style.opacity = String(Math.max(0, 1 - easeOutQuart(p * 2.2)));
        if (p >= 1) return finish();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    // Background tabs pause animation frames; never leave the page locked behind the scene.
    const safety = window.setTimeout(finish, (reduced ? REDUCED_HOLD_MS + 500 : BLOOM_MS + HOLD_MS + EXIT_MS) + 2500);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skipRef.current();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(safety);
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
      behind.forEach(el => el.removeAttribute('inert'));
      document.documentElement.style.overflow = prevOverflow;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div ref={rootRef} className="mk-blossom-intro" role="dialog" aria-modal="true" aria-label="Chào mừng đến MaokiHouse">
      <canvas ref={canvasRef} className="mk-blossom-canvas" aria-hidden="true" />
      <div className="mk-blossom-title">
        <h1>Maoki House</h1>
        <p>Make yourself at home in Saigon</p>
      </div>
      <button type="button" className="mk-blossom-skip" onClick={() => skipRef.current()}>
        Vào trang chủ <FiArrowRight aria-hidden="true" />
      </button>
    </div>
  );
}
