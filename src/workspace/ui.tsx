import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiPlus, FiInbox, FiArrowUpRight, FiLoader } from 'react-icons/fi';
import { enumLabels } from './definitions';

export function Button({ children, onClick, kind = 'secondary', type = 'button', disabled = false, busy = false, className = '', title }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'quiet'; type?: 'button' | 'submit'; disabled?: boolean; busy?: boolean; className?: string; title?: string }) {
  return <button type={type} className={`mk-button ${kind} ${className}`} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined} title={title}>{busy && <FiLoader className="mk-spin" aria-hidden="true" />}{children}</button>;
}
export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <header className="mk-page-header"><div>{eyebrow && <div className="mk-eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div><div className="mk-page-actions">{children}</div></header>;
}
export function Badge({ value, children }: { value?: string; children?: ReactNode }) { return <span className={`mk-badge ${value || ''}`}>{children || enumLabels[value || ''] || value}</span>; }
export function Empty({ title = 'Một khởi đầu mới', text, action, onAction }: { title?: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="mk-empty"><span className="mk-empty-icon"><FiInbox aria-hidden="true" /></span><h2>{title}</h2><p>{text}</p>{action && <Button kind="primary" onClick={onAction}><FiPlus aria-hidden="true" />{action}</Button>}</div>;
}
export function Dialog({ title, children, onClose, busy = false, wide = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean }) {
  const headingId = useId(); const dialog = useRef<HTMLDivElement>(null); const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = dialog.current?.querySelector<HTMLElement>('input, select, textarea, button'); first?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return createPortal(<div className="maoki-ui mk-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><div ref={dialog} className={`mk-dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1} onKeyDown={event => {
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); closeRef.current(); }
    if (event.key === 'Tab') {
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') || []);
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}><header><div><span className="mk-eyebrow">MAOKIHOUSE</span><h2 id={headingId}>{title}</h2></div><button className="mk-icon-button" aria-label="Đóng cửa sổ" onClick={onClose} disabled={busy}><FiX /></button></header>{children}</div></div>, document.body);
}
export function Stat({ label, value, note, icon }: { label: string; value: ReactNode; note: string; icon: ReactNode }) { return <div className="mk-stat"><div className="mk-stat-heading">{label}<span>{icon}</span></div><strong>{value}</strong><span className="mk-stat-note">{note}</span></div>; }
export function SectionTitle({ title, children }: { title: string; children?: ReactNode }) { return <div className="mk-section-title"><h2>{title}</h2>{children}</div>; }
export function ArrowLink() { return <FiArrowUpRight aria-hidden="true" />; }
