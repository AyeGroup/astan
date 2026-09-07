import { scanTargets } from '../registry.js';
import type { PageContext, SystemEvent } from '../types.js';

/**
 * Page Context Engine (سند §2.3، §6).
 *
 * Assembles the context payload from declared facts only: the page ID the host
 * set, the targets the host tagged, and the events the host emitted. It never
 * reads the DOM for content, never reads input values, and never inspects
 * cookies or storage — so there is no path by which a secret could leak into
 * the payload, deliberate or accidental.
 */
export class PageContextEngine {
  private pageId: string;
  private workflowId: string | null = null;
  private currentStep: string | null = null;
  private status: PageContext['page_status'] = 'ACTIVE';
  private errorCode: string | null = null;
  private readonly recentEvents: SystemEvent[] = [];
  private observer: MutationObserver | null = null;
  private onChange: (() => void) | null = null;

  constructor(pageId: string) {
    this.pageId = pageId;
  }

  setPage(pageId: string): void {
    if (this.pageId === pageId) return;
    this.pageId = pageId;
    this.errorCode = null;
    this.onChange?.();
  }

  get page(): string {
    return this.pageId;
  }

  setWorkflow(workflowId: string | null, step: string | null): void {
    this.workflowId = workflowId;
    this.currentStep = step;
  }

  setStatus(status: PageContext['page_status']): void {
    this.status = status;
  }

  setError(code: string | null): void {
    this.errorCode = code;
  }

  recordEvent(event: SystemEvent): void {
    this.recentEvents.push({ ...event, occurred_at: event.occurred_at ?? new Date().toISOString() });
    if (this.recentEvents.length > 20) this.recentEvents.shift();
  }

  snapshot(): PageContext {
    return {
      page_id: this.pageId,
      workflow_id: this.workflowId,
      current_step: this.currentStep,
      page_status: this.status,
      present_targets: scanTargets(),
      system_events: this.recentEvents.slice(-10),
      error_code: this.errorCode,
      locale: 'fa-IR',
    };
  }

  /**
   * Watch for tagged elements appearing or disappearing, so a step that
   * renders late (an async list, a modal) still gets guidance. Debounced,
   * because SPA rerenders fire in bursts.
   *
   * Mutations caused by the assistant itself are ignored. Without that
   * filter the widget's own render — a new chat bubble, a tooltip, the
   * highlight class — retriggers the observer, which syncs context, which
   * renders again: an infinite request loop against our own API.
   */
  observe(onChange: () => void): void {
    this.onChange = onChange;
    if (typeof MutationObserver === 'undefined') return;
    let timer: number | undefined;
    this.observer = new MutationObserver((records) => {
      if (!records.some((record) => !isAssistantOwned(record.target))) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => onChange(), 300);
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-assistant-target', 'hidden', 'style'],
    });
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}

const ASSISTANT_OWNED = '.astan-widget, .astan-assistant-tooltip';

function isAssistantOwned(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return Boolean(element?.closest(ASSISTANT_OWNED));
}
