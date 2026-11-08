/**
 * Procedural watercolor-on-vintage-paper painter for the guest intro.
 * Everything is drawn with Canvas 2D from a seeded RNG: no image assets,
 * no network, identical result on every device.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D unavailable');
  return g;
}

/* ───────────────────────── vintage paper ───────────────────────── */

/** Aged rag paper: warm vignette, mottling, fibres, foxing and fine grain. */
export function paintPaper(width: number, height: number, seed = 7, tile = false): HTMLCanvasElement {
  const canvas = makeCanvas(width, height);
  const g = ctx2d(canvas);
  const rnd = mulberry32(seed);
  const w = canvas.width;
  const h = canvas.height;
  const diag = Math.hypot(w, h) / 2;

  if (tile) {
    // A repeating sheet: flat tone, no vignette, so copies join without seams.
    g.fillStyle = '#f1e6cf';
    g.fillRect(0, 0, w, h);
  } else {
    const base = g.createRadialGradient(w / 2, h * 0.46, diag * 0.1, w / 2, h / 2, diag);
    base.addColorStop(0, '#f3e8d0');
    base.addColorStop(0.55, '#ead9b6');
    base.addColorStop(1, '#d3b987');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
  }

  // A repeating tile draws every blob at its wrapped positions so the seams vanish.
  const offsets: Array<[number, number]> = tile ? [[0, 0], [-w, 0], [w, 0], [0, -h], [0, h], [-w, -h], [w, -h], [-w, h], [w, h]] : [[0, 0]];

  // Cloudy mottling from hundreds of huge, near-invisible washes.
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = (tile ? 0.1 + rnd() * 0.2 : 0.08 + rnd() * 0.28) * Math.max(w, h);
    const warm = rnd() > 0.5;
    const tone = warm ? '176, 128, 70' : '255, 250, 235';
    for (const [ox, oy] of offsets) {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grd.addColorStop(0, `rgba(${tone}, ${warm ? 0.05 : 0.07})`);
      grd.addColorStop(1, `rgba(${tone}, 0)`);
      g.fillStyle = grd;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }

  // Foxing: small oxidised rust blotches.
  const foxCount = Math.round((w * h) / 28000);
  for (let i = 0; i < foxCount; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 3 + Math.pow(rnd(), 2.4) * 34;
    const a = 0.05 + rnd() * 0.12;
    for (const [ox, oy] of offsets) {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grd.addColorStop(0, `rgba(139, 92, 46, ${a})`);
      grd.addColorStop(0.6, `rgba(150, 104, 56, ${a * 0.5})`);
      grd.addColorStop(1, 'rgba(150, 104, 56, 0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x + ox, y + oy, r, 0, TAU);
      g.fill();
    }
  }

  // Rag fibres: short hairlines, light and dark.
  g.lineCap = 'round';
  const fibreCount = Math.round((w * h) / 520);
  for (let i = 0; i < fibreCount; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const a = rnd() * TAU;
    const len = 4 + rnd() * 16;
    const dark = rnd() > 0.45;
    g.strokeStyle = dark ? `rgba(110, 78, 40, ${0.04 + rnd() * 0.07})` : `rgba(255, 252, 240, ${0.12 + rnd() * 0.18})`;
    g.lineWidth = 0.5 + rnd() * 0.5;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.8) * len * 0.5, y + Math.sin(a + 0.8) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }

  // Edge burn: soft darkening where the sheet meets the table.
  const edge = tile ? 0 : Math.min(w, h) * 0.07;
  const sides: Array<[number, number, number, number, number, number, number, number]> = [
    [0, 0, edge, 0, 0, 0, edge, h],
    [w, 0, w - edge, 0, w - edge, 0, edge, h],
    [0, 0, 0, edge, 0, 0, w, edge],
    [0, h, 0, h - edge, 0, h - edge, w, edge],
  ];
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of tile ? [] : sides) {
    const grd = g.createLinearGradient(x0, y0, x1, y1);
    grd.addColorStop(0, 'rgba(120, 82, 40, 0.22)');
    grd.addColorStop(1, 'rgba(120, 82, 40, 0)');
    g.fillStyle = grd;
    g.fillRect(rx, ry, rw, rh);
  }

  // Fine luminance grain.
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.9));
  }
  g.putImageData(img, 0, 0);

  return canvas;
}

/* ───────────────────────── watercolor sakura ───────────────────────── */

type Pt = [number, number];

/** Petal outline pointing up from the origin: narrow claw, broad shoulders, notched tip. */
function petalOutline(len: number, wid: number): Pt[] {
  // Control points down the right edge (x as a fraction of `wid`, y as a fraction of `len`);
  // the left edge mirrors them, and the smoothing in tracePath rounds every corner.
  const right: Array<[number, number]> = [
    [0.2, 0.1],
    [0.62, 0.36],
    [0.96, 0.64],
    [0.9, 0.86],
    [0.55, 0.99],
    [0.22, 0.96],
  ];
  const pts: Pt[] = [[0, 0]];
  for (const [x, y] of right) pts.push([x * wid, -y * len]);
  pts.push([0, -len * 0.8]); // the notch
  for (let i = right.length - 1; i >= 0; i--) pts.push([-right[i][0] * wid, -right[i][1] * len]);
  return pts;
}

/** Subdivide and wobble an outline so each glaze has its own hand-wavered edge. */
function wobble(pts: Pt[], rnd: Rng, amount: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push([a[0] + (rnd() - 0.5) * amount, a[1] + (rnd() - 0.5) * amount]);
    out.push([(a[0] + b[0]) / 2 + (rnd() - 0.5) * amount * 1.4, (a[1] + b[1]) / 2 + (rnd() - 0.5) * amount * 1.4]);
  }
  return out;
}

function tracePath(g: CanvasRenderingContext2D, pts: Pt[]) {
  const n = pts.length;
  g.beginPath();
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  g.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  g.closePath();
}

export interface Palette {
  wash: string; // rgb triplet of the main glaze
  pool: string; // deeper pigment that settles at edges and base
  vein: string;
}

const PALETTES: Palette[] = [
  { wash: '236, 150, 172', pool: '196, 84, 120', vein: '176, 62, 100' },
  { wash: '244, 176, 190', pool: '208, 108, 138', vein: '186, 78, 112' },
  { wash: '248, 200, 208', pool: '222, 132, 156', vein: '196, 92, 124' },
  { wash: '232, 134, 160', pool: '184, 72, 108', vein: '164, 54, 92' },
];

export interface PetalSprite {
  canvas: HTMLCanvasElement;
  /** Pixel position of the petal base (the pivot) inside the sprite. */
  pivotX: number;
  pivotY: number;
  length: number;
}

/** One watercolor petal: layered glazes, pigment pooling at the rim and the base. */
export function paintPetal(len: number, variant: number, seed: number): PetalSprite {
  const rnd = mulberry32(seed * 977 + variant * 131);
  const pal = PALETTES[variant % PALETTES.length];
  const wid = len * (0.4 + rnd() * 0.06);
  const pad = Math.ceil(len * 0.14);
  const cw = Math.ceil(wid * 2 + pad * 2);
  const ch = Math.ceil(len + pad * 2);
  const canvas = makeCanvas(cw, ch);
  const g = ctx2d(canvas);
  const px = cw / 2;
  const py = ch - pad;
  g.translate(px, py);

  const outline = petalOutline(len, wid);
  const wob = len * 0.035;

  // Glazes: eight thin washes, each slightly displaced, build soft body colour.
  for (let i = 0; i < 8; i++) {
    tracePath(g, wobble(outline, rnd, wob));
    g.fillStyle = `rgba(${pal.wash}, ${0.085 + rnd() * 0.05})`;
    g.fill();
  }

  // Everything that follows stays inside the petal.
  g.save();
  tracePath(g, outline);
  g.clip();

  // Pigment settles toward the base like a wet-in-wet drop.
  const base = g.createRadialGradient(0, -len * 0.04, 0, 0, -len * 0.04, len * 0.62);
  base.addColorStop(0, `rgba(${pal.pool}, 0.62)`);
  base.addColorStop(0.5, `rgba(${pal.pool}, 0.2)`);
  base.addColorStop(1, `rgba(${pal.pool}, 0)`);
  g.fillStyle = base;
  g.fillRect(-wid * 1.2, -len * 1.2, wid * 2.4, len * 1.4);

  // A bloom of lighter water pushed pigment away from the tip (the classic cauliflower edge).
  const tip = g.createRadialGradient(0, -len * 0.82, 0, 0, -len * 0.82, len * 0.28);
  tip.addColorStop(0, 'rgba(255, 244, 232, 0.5)');
  tip.addColorStop(1, 'rgba(255, 244, 232, 0)');
  g.fillStyle = tip;
  g.fillRect(-wid, -len * 1.1, wid * 2, len * 0.6);

  // Edge darkening: stacked wide, faint strokes → pigment dried at the rim.
  g.lineJoin = 'round';
  for (const [lw, a] of [[len * 0.16, 0.07], [len * 0.1, 0.1], [len * 0.05, 0.14], [len * 0.022, 0.22]] as const) {
    tracePath(g, wobble(outline, rnd, wob * 0.5));
    g.strokeStyle = `rgba(${pal.pool}, ${a})`;
    g.lineWidth = lw;
    g.stroke();
  }

  // Veins fanning from the base, barely there.
  g.lineCap = 'round';
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(0, -len * 0.04);
    g.quadraticCurveTo(i * wid * 0.22, -len * 0.45, i * wid * 0.3, -len * (0.74 - Math.abs(i) * 0.06));
    g.strokeStyle = `rgba(${pal.vein}, ${0.1 - Math.abs(i) * 0.025})`;
    g.lineWidth = Math.max(0.6, len * 0.012);
    g.stroke();
  }

  // Granulation: pigment flecks caught in the paper tooth.
  for (let i = 0; i < len * 1.6; i++) {
    const x = (rnd() - 0.5) * wid * 1.8;
    const y = -rnd() * len;
    g.fillStyle = `rgba(${pal.pool}, ${0.04 + rnd() * 0.08})`;
    g.fillRect(x, y, 1 + rnd() * 1.4, 1 + rnd() * 1.4);
  }
  g.restore();

  return { canvas, pivotX: px, pivotY: py, length: len };
}

export interface CenterSprite {
  canvas: HTMLCanvasElement;
  radius: number; // half sprite size in px
}

/** Flower heart: pooled magenta wash and a spray of stamens ending in ink-dark anthers. */
export function paintHeart(size: number, seed: number): CenterSprite {
  const rnd = mulberry32(seed * 313 + 5);
  const s = Math.ceil(size);
  const canvas = makeCanvas(s, s);
  const g = ctx2d(canvas);
  g.translate(s / 2, s / 2);
  const r = s / 2;

  const pool = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
  pool.addColorStop(0, 'rgba(176, 52, 92, 0.78)');
  pool.addColorStop(0.6, 'rgba(206, 98, 130, 0.36)');
  pool.addColorStop(1, 'rgba(206, 98, 130, 0)');
  g.fillStyle = pool;
  g.beginPath();
  g.arc(0, 0, r * 0.5, 0, TAU);
  g.fill();

  g.lineCap = 'round';
  const count = 11;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + (rnd() - 0.5) * 0.4;
    const l = r * (0.5 + rnd() * 0.32);
    const bend = (rnd() - 0.5) * 0.5;
    const ex = Math.cos(a + bend) * l;
    const ey = Math.sin(a + bend) * l;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(Math.cos(a) * l * 0.5, Math.sin(a) * l * 0.5, ex, ey);
    g.strokeStyle = 'rgba(180, 70, 104, 0.58)';
    g.lineWidth = Math.max(0.7, r * 0.026);
    g.stroke();
    g.fillStyle = 'rgba(86, 38, 52, 0.82)';
    g.beginPath();
    g.arc(ex, ey, Math.max(0.9, r * 0.05), 0, TAU);
    g.fill();
  }
  return { canvas, radius: r };
}

/* ───────────────────────── the spiral ───────────────────────── */

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export interface Blossom {
  /** Polar slot on the phyllotaxis spiral. */
  angle: number;
  radius: number;
  /** 0‥1 position along the spiral (drives when the flower opens). */
  order: number;
  size: number; // petal length in CSS px
  spin: number; // own rotation
  petalVariants: number[];
  heart: number;
  /** Individual wobble in the opening, so the bloom never marches in lockstep. */
  lag: number;
}

export interface SpiralLayout {
  blossoms: Blossom[];
  maxRadius: number;
}

export function layoutSpiral(width: number, height: number, seed = 21): SpiralLayout {
  const rnd = mulberry32(seed);
  const maxRadius = Math.hypot(width, height) / 2 + 40;
  const compact = Math.min(width, height) < 560;
  // A handful of very large blossoms: each petal reaches roughly a third of the short side,
  // so one flower fills about a quarter of the screen and the rest spill past the edges.
  const count = compact ? 5 : 6;
  const petal = Math.min(width, height) * (compact ? 0.5 : 0.36);
  const blossoms: Blossom[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const radius = (0.32 + 0.6 * Math.sqrt(t)) * (maxRadius - 40);
    blossoms.push({
      angle: i * GOLDEN + 0.6,
      radius,
      order: i / count,
      size: petal * (0.82 + 0.3 * t + rnd() * 0.12),
      spin: rnd() * TAU,
      petalVariants: [0, 1, 2, 3, 4].map(() => Math.floor(rnd() * PALETTES.length)),
      heart: Math.floor(rnd() * 3),
      lag: rnd() * 0.06,
    });
  }
  return { blossoms, maxRadius };
}

export interface Sprites {
  petals: PetalSprite[]; // every variant, painted at reference length
  hearts: CenterSprite[];
  refLength: number;
}

export function buildSprites(dpr: number): Sprites {
  const refLength = Math.round(280 * Math.min(dpr, 2));
  const petals: PetalSprite[] = [];
  for (let v = 0; v < 8; v++) petals.push(paintPetal(refLength, v, 11 + v));
  const hearts: CenterSprite[] = [0, 1, 2].map(i => paintHeart(refLength * 0.7, 40 + i));
  return { petals, hearts, refLength };
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Draw the swirling bloom at progress `t` (0‥1) onto `g`, in CSS-pixel units.
 * Pigment is multiplied into the paper so overlaps deepen like real glazes.
 */
export function drawBloom(
  g: CanvasRenderingContext2D,
  layout: SpiralLayout,
  sprites: Sprites,
  t: number,
  cx: number,
  cy: number,
  dpr: number,
) {
  const unwind = 1 - easeOutCubic(clamp01(t / 0.92)); // 1 → 0 : the vortex loosens
  const expand = 0.5 + 0.5 * easeOutExpo(clamp01(t / 0.8)); // pattern drifts outward as it opens
  g.save();
  g.globalCompositeOperation = 'multiply';

  for (const b of layout.blossoms) {
    const start = b.order * 0.58 + b.lag;
    const local = clamp01((t - start) / 0.38);
    if (local <= 0) continue;

    const radial = b.radius / layout.maxRadius;
    const swirl = unwind * (2.9 - 1.5 * radial) * Math.PI; // inner arms whirl faster
    const a = b.angle + swirl;
    const r = b.radius * expand;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;

    const open = easeOutBack(local);
    const scale = (b.size / sprites.refLength) * dpr * (0.18 + 0.82 * clamp01(open));
    const spread = 0.12 + 0.88 * clamp01(open); // bud → full bloom
    const alpha = clamp01(local * 2.4);
    const flowerSpin = b.spin + swirl * 0.5;

    g.globalAlpha = alpha;
    for (let k = 0; k < 5; k++) {
      const sprite = sprites.petals[b.petalVariants[k]];
      g.save();
      g.translate(x * dpr, y * dpr);
      g.rotate(flowerSpin + k * (TAU / 5) * spread);
      g.scale(scale, scale * (0.7 + 0.3 * clamp01(open)));
      g.drawImage(sprite.canvas, -sprite.pivotX, -sprite.pivotY);
      g.restore();
    }

    const heartAlpha = clamp01((local - 0.45) / 0.4);
    if (heartAlpha > 0) {
      const heart = sprites.hearts[b.heart];
      const hs = scale * 0.62;
      g.globalAlpha = alpha * heartAlpha;
      g.drawImage(heart.canvas, x * dpr - heart.radius * hs, y * dpr - heart.radius * hs, heart.radius * 2 * hs, heart.radius * 2 * hs);
    }
  }
  g.restore();
}

/* ───────────────────────── static art for the page ───────────────────────── */

/** One full-bloom flower on a transparent canvas, ready to sit on the page with mix-blend-mode: multiply. */
export function paintFlower(petalLength: number, seed: number): HTMLCanvasElement {
  const rnd = mulberry32(seed * 53 + 9);
  const reach = Math.ceil(petalLength * 1.12);
  const canvas = makeCanvas(reach * 2, reach * 2);
  const g = ctx2d(canvas);
  g.globalCompositeOperation = 'multiply';
  const turn = rnd() * TAU;
  for (let k = 0; k < 5; k++) {
    const petal = paintPetal(petalLength, Math.floor(rnd() * PALETTES.length), seed * 7 + k);
    g.save();
    g.translate(reach, reach);
    g.rotate(turn + k * (TAU / 5) + (rnd() - 0.5) * 0.18);
    g.drawImage(petal.canvas, -petal.pivotX, -petal.pivotY);
    g.restore();
  }
  const heart = paintHeart(petalLength * 0.7, seed);
  const hs = petalLength * 0.62;
  g.drawImage(heart.canvas, reach - hs / 2 * 1.4, reach - hs / 2 * 1.4, hs * 1.4, hs * 1.4);
  return canvas;
}

/** A single drifting petal (transparent). */
export function paintLoosePetal(length: number, seed: number): HTMLCanvasElement {
  return paintPetal(length, seed, 300 + seed).canvas;
}
