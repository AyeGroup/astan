import type { ActionTarget } from './types.js';

/**
 * Element registry.
 *
 * A target is addressable only if the page author marked the element with
 * `data-assistant-target="..."`. The agent therefore cannot reach an element
 * nobody opted in — a password input that was never tagged simply does not
 * exist as far as the assistant is concerned (سند §4، §36).
 */
export const TARGET_ATTRIBUTE = 'data-assistant-target';

/** Targets the SDK refuses to resolve even if a page mistakenly tags them. */
const FORBIDDEN_INPUT_TYPES = new Set(['password', 'hidden']);

export function scanTargets(root: ParentNode = document): ActionTarget[] {
  const nodes = root.querySelectorAll<HTMLElement>(`[${TARGET_ATTRIBUTE}]`);
  const found: ActionTarget[] = [];
  nodes.forEach((node) => {
    const name = node.getAttribute(TARGET_ATTRIBUTE);
    if (name && isVisible(node)) found.push(name);
  });
  return Array.from(new Set(found));
}

export function resolveTarget(target: ActionTarget, allowed: Set<ActionTarget>): HTMLElement | null {
  if (!allowed.has(target)) return null;
  const escaped = target.replace(/"/g, '\\"');
  const element = document.querySelector<HTMLElement>(`[${TARGET_ATTRIBUTE}="${escaped}"]`);
  if (!element || !isVisible(element)) return null;
  if (element instanceof HTMLInputElement && FORBIDDEN_INPUT_TYPES.has(element.type)) return null;
  return element;
}

function isVisible(element: HTMLElement): boolean {
  if (element.hidden) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0;
}
