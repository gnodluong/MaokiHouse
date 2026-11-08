import { useEffect, useState } from 'react';
import { paintFlower, paintLoosePetal, paintPaper } from './blossomPainter';

export interface WatercolorArt {
  /** Seamless aged-paper tile. */
  paper: string;
  /** Full-bloom sakura, transparent background (use with mix-blend-mode: multiply). */
  flowers: string[];
  /** Single loose petals. */
  petals: string[];
}

function toUrl(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('toBlob failed'))), type, quality);
  });
}

let cached: Promise<WatercolorArt> | null = null;

/** Paints the page art once per tab (lazily, after first paint) and shares it. */
export function loadWatercolor(): Promise<WatercolorArt> {
  if (!cached) {
    cached = (async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const paper = await toUrl(paintPaper(512, 512, 31, true), 'image/jpeg', 0.82);
      const flowers = await Promise.all(
        [0, 1, 2, 3].map(i => toUrl(paintFlower(Math.round(240 * dpr), 61 + i * 17), 'image/png')),
      );
      const petals = await Promise.all(
        [0, 1, 2].map(i => toUrl(paintLoosePetal(Math.round(70 * dpr), i), 'image/png')),
      );
      return { paper, flowers, petals };
    })().catch(error => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

export function useWatercolor(): WatercolorArt | null {
  const [art, setArt] = useState<WatercolorArt | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => void loadWatercolor().then(result => { if (alive) setArt(result); }).catch(() => {});
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const handle = idle ? idle(run, { timeout: 600 }) : window.setTimeout(run, 60);
    return () => {
      alive = false;
      if (idle) (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle);
      else window.clearTimeout(handle);
    };
  }, []);
  return art;
}
