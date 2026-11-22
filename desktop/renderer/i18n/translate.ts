import { phrases, patterns } from './phrases';
import type { Lang } from './ui';

const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'] as const;
const textOriginal = new WeakMap<Text, string>();
const attrOriginal = new WeakMap<Element, Map<string, string>>();
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

function lookup(source: string): string | null {
  const trimmed = source.trim();
  if (!trimmed) return null;
  const exact = phrases[trimmed];
  if (exact) return source.replace(trimmed, exact);
  for (const [pattern, replacement] of patterns) if (pattern.test(trimmed)) return source.replace(trimmed, trimmed.replace(pattern, replacement));
  return null;
}

function translateText(node: Text, lang: Lang) {
  if (node.parentElement && SKIP.has(node.parentElement.tagName)) return;
  const known = textOriginal.get(node);
  // React rewrote the node with fresh Vietnamese text: treat the current value as the new original.
  if (known !== undefined && node.data !== known && lookup(known) !== node.data) textOriginal.set(node, node.data);
  const original = textOriginal.get(node) ?? node.data;
  if (!textOriginal.has(node)) textOriginal.set(node, original);
  const next = lang === 'en' ? lookup(original) ?? original : original;
  if (node.data !== next) node.data = next;
}

function translateAttrs(element: Element, lang: Lang) {
  for (const name of ATTRS) {
    const value = element.getAttribute(name);
    if (value === null) continue;
    let saved = attrOriginal.get(element);
    if (!saved) { saved = new Map(); attrOriginal.set(element, saved); }
    const known = saved.get(name);
    if (known === undefined || (value !== known && lookup(known) !== value)) saved.set(name, value);
    const original = saved.get(name)!;
    const next = lang === 'en' ? lookup(original) ?? original : original;
    if (value !== next) element.setAttribute(name, next);
  }
}

function walk(root: Node, lang: Lang) {
  if (root.nodeType === Node.TEXT_NODE) { translateText(root as Text, lang); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  translateAttrs(root as Element, lang);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) translateText(node as Text, lang); else translateAttrs(node as Element, lang);
  }
}

/** Keeps everything under <body> in the chosen language (shared pages, dialogs and toasts included). */
export function startTranslator(lang: Lang): () => void {
  walk(document.body, lang);
  let queued = false; const pending = new Set<Node>();
  const flush = () => { queued = false; observer.disconnect(); pending.forEach(node => { if (node.isConnected) walk(node, lang); }); pending.clear(); observe(); };
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(node => pending.add(node));
      else pending.add(record.target);
    }
    if (!queued) { queued = true; queueMicrotask(flush); }
  });
  const observe = () => observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  observe();
  return () => { observer.disconnect(); walk(document.body, 'vi'); };
}
