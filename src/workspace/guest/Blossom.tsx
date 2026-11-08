import { createContext, useContext } from 'react';
import type { CSSProperties } from 'react';
import type { WatercolorArt } from './watercolor';

export const WatercolorContext = createContext<WatercolorArt | null>(null);

interface BlossomProps {
  /** Which painted flower (or petal) to use; wraps around. */
  index?: number;
  kind?: 'flower' | 'petal';
  className?: string;
  style?: CSSProperties;
}

/** Decorative watercolor flower or petal. Renders nothing until the art has been painted. */
export function Blossom({ index = 0, kind = 'flower', className = '', style }: BlossomProps) {
  const art = useContext(WatercolorContext);
  if (!art) return null;
  const list = kind === 'flower' ? art.flowers : art.petals;
  return (
    <img
      className={`mk-blossom mk-blossom-${kind} ${className}`}
      src={list[index % list.length]}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={style}
    />
  );
}
