import { resolveTarget } from '../registry.js';
import type { ActionTarget, AssistantAction, SdkOptions } from '../types.js';

/**
 * Action Controller (سند §14).
 *
 * The client-side half of the policy boundary. The backend already validated
 * every action, but this layer validates again against what is actually on
 * screen right now — the page may have changed in the milliseconds since the
 * context was sent, and a highlight aimed at a vanished element is a bug the
 * user sees.
 */
export interface ActionControllerHooks {
  onInstruction: (title: string, body: string) => void;
  onHelp: (topic: string) => void;
  onOperationRequested: (operation: string, requiresConfirmation: boolean) => void;
  onHumanSupport: (reason?: string) => void;
  onGuidedMode: (enabled: boolean) => void;
}

export class ActionController {
  private allowed = new Set<ActionTarget>();
  private readonly highlighted = new Set<HTMLElement>();
  private tooltip: HTMLElement | null = null;
  private tooltipAnchor: HTMLElement | null = null;
  private repositionBound: (() => void) | null = null;

  constructor(private readonly options: SdkOptions, private readonly hooks: ActionControllerHooks) {
    this.injectStyles();
  }

  setAllowedTargets(targets: ActionTarget[]): void {
    this.allowed = new Set(targets);
  }

  execute(actions: AssistantAction[]): void {
    for (const action of actions) {
      try {
        this.run(action);
      } catch (error) {
        if (this.options.debug) console.warn('[AssistantSDK] action failed', action, error);
      }
    }
  }

  private run(action: AssistantAction): void {
    switch (action.type) {
      case 'clear_highlights':
        this.clear();
        break;

      case 'highlight_element': {
        const el = resolveTarget(action.target, this.allowed);
        if (!el) return;
        this.clearHighlights();
        el.classList.add('astan-assistant-highlight');
        this.highlighted.add(el);
        if (action.message) this.showTooltip(el, action.message);
        break;
      }

      case 'scroll_to_element': {
        const el = resolveTarget(action.target, this.allowed);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        break;
      }

      case 'show_tooltip': {
        const el = resolveTarget(action.target, this.allowed);
        if (!el) return;
        this.showTooltip(el, action.message);
        break;
      }

      case 'navigate':
        // Delegated: the host owns its router (see SdkOptions.onNavigate).
        this.options.onNavigate?.(action.route);
        break;

      case 'open_help':
        this.hooks.onHelp(action.topic);
        break;

      case 'show_instruction':
        this.hooks.onInstruction(action.title, action.body);
        break;

      case 'request_operation':
        this.hooks.onOperationRequested(action.operation, action.requires_confirmation !== false);
        break;

      case 'offer_human_support':
        this.hooks.onHumanSupport(action.reason);
        break;

      case 'start_guided_mode':
        this.hooks.onGuidedMode(true);
        break;

      case 'stop_guided_mode':
        this.hooks.onGuidedMode(false);
        break;

      default:
        break;
    }
  }

  /**
   * `keepHighlights` is for minimising the panel during guided mode: the
   * tooltip is chrome, but the highlight IS the guidance — wiping it because
   * the user collapsed the chat would leave them staring at a page with no
   * indication of where to click.
   */
  clear(keepHighlights = false): void {
    if (!keepHighlights) this.clearHighlights();
    this.hideTooltip();
  }

  private clearHighlights(): void {
    for (const el of this.highlighted) el.classList.remove('astan-assistant-highlight');
    this.highlighted.clear();
  }

  private showTooltip(anchor: HTMLElement, message: string): void {
    this.hideTooltip();
    const tip = document.createElement('div');
    tip.className = 'astan-assistant-tooltip';
    tip.setAttribute('role', 'status');
    tip.dir = 'rtl';
    tip.textContent = message;
    document.body.appendChild(tip);
    this.tooltip = tip;
    this.tooltipAnchor = anchor;
    this.positionTooltip();

    this.repositionBound = () => this.positionTooltip();
    window.addEventListener('scroll', this.repositionBound, true);
    window.addEventListener('resize', this.repositionBound);
    window.setTimeout(() => this.hideTooltip(), 9000);
  }

  private positionTooltip(): void {
    if (!this.tooltip || !this.tooltipAnchor) return;
    const rect = this.tooltipAnchor.getBoundingClientRect();
    const tipRect = this.tooltip.getBoundingClientRect();
    // Prefer below; flip above when the anchor sits near the viewport bottom.
    const below = rect.bottom + 10;
    const top = below + tipRect.height > window.innerHeight ? rect.top - tipRect.height - 10 : below;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - tipRect.width - 8));
    this.tooltip.style.top = `${Math.max(8, top) + window.scrollY}px`;
    this.tooltip.style.left = `${left + window.scrollX}px`;
  }

  private hideTooltip(): void {
    if (this.repositionBound) {
      window.removeEventListener('scroll', this.repositionBound, true);
      window.removeEventListener('resize', this.repositionBound);
      this.repositionBound = null;
    }
    this.tooltip?.remove();
    this.tooltip = null;
    this.tooltipAnchor = null;
  }

  private injectStyles(): void {
    if (document.getElementById('astan-assistant-action-styles')) return;
    const style = document.createElement('style');
    style.id = 'astan-assistant-action-styles';
    style.textContent = `
.astan-assistant-highlight {
  position: relative;
  outline: 3px solid #16a34a !important;
  outline-offset: 3px;
  border-radius: 8px;
  animation: astan-assistant-pulse 1.6s ease-in-out 3;
  scroll-margin: 120px;
}
@keyframes astan-assistant-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.45); }
  50% { box-shadow: 0 0 0 10px rgba(22, 163, 74, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .astan-assistant-highlight { animation: none; }
}
.astan-assistant-tooltip {
  position: absolute;
  z-index: 2147483000;
  max-width: 280px;
  padding: 10px 12px;
  background: #0f2c4d;
  color: #fff;
  border-radius: 10px;
  font: 400 13px/1.7 inherit;
  box-shadow: 0 8px 24px rgba(15, 44, 77, 0.28);
  pointer-events: none;
}`;
    document.head.appendChild(style);
  }
}
