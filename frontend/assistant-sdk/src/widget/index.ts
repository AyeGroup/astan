import type { QuickAction, WorkflowView } from '../types.js';
import { WIDGET_STYLES } from './styles.js';

/**
 * Assistant widget (سند §16، §17، §20).
 *
 * Plain DOM, no framework: it has to mount inside a portal whose stack we do
 * not control, and a 2 KB render loop we own beats a peer dependency we cannot
 * guarantee. All text is Persian and the panel is RTL.
 */
export interface WidgetHooks {
  onSend: (message: string) => void;
  onQuickAction: (action: QuickAction) => void;
  onOperationConfirm: (operation: string, confirmed: boolean) => void;
  onFeedback: (helpful: boolean) => void;
  onOpen: () => void;
  onClose: () => void;
}

type Speaker = 'assistant' | 'user' | 'system';

export class AssistantWidget {
  private root!: HTMLElement;
  private launcher!: HTMLButtonElement;
  private panel!: HTMLElement;
  private body!: HTMLElement;
  private quickBar!: HTMLElement;
  private input!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private progress!: HTMLElement;
  private dots!: HTMLElement;
  private progressLabel!: HTMLElement;
  private confirmBox!: HTMLElement;
  private typingNode: HTMLElement | null = null;
  private pendingOperation: string | null = null;
  private open = false;

  constructor(private readonly hooks: WidgetHooks) {
    this.mount();
  }

  private mount(): void {
    const style = document.createElement('style');
    style.id = 'astan-assistant-widget-styles';
    style.textContent = WIDGET_STYLES;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'astan-widget';
    this.root.dir = 'rtl';
    this.root.lang = 'fa';

    this.launcher = document.createElement('button');
    this.launcher.type = 'button';
    this.launcher.className = 'astan-launcher';
    this.launcher.setAttribute('aria-label', 'باز کردن راهنمای هوشمند');
    this.launcher.innerHTML = '<span aria-hidden="true">🤖</span><span>راهنمای هوشمند</span>';
    this.launcher.addEventListener('click', () => this.setOpen(true));

    this.panel = document.createElement('div');
    this.panel.className = 'astan-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'راهنمای هوشمند خدمات قضایی');
    this.panel.hidden = true;
    this.panel.innerHTML = `
      <div class="astan-header">
        <div class="astan-header-row">
          <div class="astan-title"><span aria-hidden="true">🧭</span><span>راهنمای هوشمند</span></div>
          <div class="astan-header-buttons">
            <button type="button" class="astan-icon-btn" data-act="minimize" aria-label="بستن پنجره">−</button>
          </div>
        </div>
        <div class="astan-progress" hidden>
          <div class="astan-progress-label"></div>
          <div class="astan-dots"></div>
        </div>
      </div>
      <div class="astan-body" role="log" aria-live="polite"></div>
      <div class="astan-quick"></div>
      <div class="astan-confirm" hidden>
        <p></p>
        <div class="astan-confirm-actions">
          <button type="button" class="astan-confirm-yes">بله، انجام شود</button>
          <button type="button" class="astan-confirm-no">فعلاً نه</button>
        </div>
      </div>
      <div class="astan-footer">
        <div class="astan-input-row">
          <textarea class="astan-input" rows="1" placeholder="سؤال خود را بنویسید…" aria-label="پیام شما"></textarea>
          <button type="button" class="astan-send" aria-label="ارسال">➤</button>
        </div>
        <div class="astan-privacy">رمز عبور، رمز موقت یا کد ملی خود را اینجا وارد نکنید.</div>
        <div class="astan-feedback">
          <button type="button" data-feedback="yes">👍 کمک کرد</button>
          <button type="button" data-feedback="no">👎 کمک نکرد</button>
        </div>
      </div>`;

    this.root.append(this.launcher, this.panel);
    document.body.appendChild(this.root);

    this.body = this.panel.querySelector('.astan-body')!;
    this.quickBar = this.panel.querySelector('.astan-quick')!;
    this.input = this.panel.querySelector('.astan-input')!;
    this.sendBtn = this.panel.querySelector('.astan-send')!;
    this.progress = this.panel.querySelector('.astan-progress')!;
    this.progressLabel = this.panel.querySelector('.astan-progress-label')!;
    this.dots = this.panel.querySelector('.astan-dots')!;
    this.confirmBox = this.panel.querySelector('.astan-confirm')!;

    this.panel.querySelector('[data-act="minimize"]')!.addEventListener('click', () => this.setOpen(false));
    this.sendBtn.addEventListener('click', () => this.submit());
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.submit();
      }
    });
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = `${Math.min(this.input.scrollHeight, 96)}px`;
    });
    this.panel.querySelector('.astan-confirm-yes')!.addEventListener('click', () => this.resolveConfirm(true));
    this.panel.querySelector('.astan-confirm-no')!.addEventListener('click', () => this.resolveConfirm(false));
    this.panel.querySelectorAll('[data-feedback]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.hooks.onFeedback(btn.getAttribute('data-feedback') === 'yes');
        this.addMessage('system', 'ممنون از بازخوردتان.');
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.open) this.setOpen(false);
    });
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.panel.hidden = !open;
    this.launcher.hidden = open;
    if (open) {
      this.input.focus();
      this.hooks.onOpen();
    } else {
      this.hooks.onClose();
    }
  }

  get isOpen(): boolean {
    return this.open;
  }

  private submit(): void {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = '';
    this.input.style.height = 'auto';
    this.addMessage('user', text);
    this.hooks.onSend(text);
  }

  addMessage(speaker: Speaker, text: string): void {
    const row = document.createElement('div');
    row.className = `astan-msg ${speaker}`;
    const bubble = document.createElement('div');
    bubble.className = 'astan-msg-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    this.body.appendChild(row);
    this.body.scrollTop = this.body.scrollHeight;
  }

  setTyping(active: boolean): void {
    if (active) {
      if (this.typingNode) return;
      const row = document.createElement('div');
      row.className = 'astan-msg assistant';
      row.innerHTML = '<div class="astan-msg-bubble astan-typing"><span></span><span></span><span></span></div>';
      this.body.appendChild(row);
      this.body.scrollTop = this.body.scrollHeight;
      this.typingNode = row;
      this.sendBtn.disabled = true;
    } else {
      this.typingNode?.remove();
      this.typingNode = null;
      this.sendBtn.disabled = false;
    }
  }

  setQuickActions(actions: QuickAction[]): void {
    this.quickBar.replaceChildren();
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `${action.icon ?? ''} ${action.label}`.trim();
      btn.addEventListener('click', () => {
        this.addMessage('user', action.label);
        this.hooks.onQuickAction(action);
      });
      this.quickBar.appendChild(btn);
    }
  }

  /** «مرحله ۲ از ۴ / ● ● ○ ○» (سند §16). */
  setWorkflow(view: WorkflowView): void {
    if (!view.workflow_id || view.total === 0) {
      this.progress.hidden = true;
      return;
    }
    this.progress.hidden = false;
    const label = view.completed
      ? `${view.workflow_title} — انجام شد ✅`
      : `${view.workflow_title} — مرحله ${view.position} از ${view.total}${view.step_title ? `: ${view.step_title}` : ''}`;
    this.progressLabel.textContent = label;
    this.dots.replaceChildren();
    for (let i = 1; i <= view.total; i++) {
      const dot = document.createElement('span');
      dot.className = 'astan-dot';
      if (view.completed || i < view.position) dot.classList.add('is-done');
      else if (i === view.position) dot.classList.add('is-current');
      this.dots.appendChild(dot);
    }
  }

  /** Confirmation gate for privileged operations (سند §15). */
  requestConfirmation(operation: string, prompt: string): void {
    this.pendingOperation = operation;
    this.confirmBox.querySelector('p')!.textContent = prompt;
    this.confirmBox.hidden = false;
    if (!this.open) this.setOpen(true);
  }

  private resolveConfirm(confirmed: boolean): void {
    const operation = this.pendingOperation;
    this.pendingOperation = null;
    this.confirmBox.hidden = true;
    if (operation) this.hooks.onOperationConfirm(operation, confirmed);
  }

  notify(): void {
    if (this.open) return;
    if (this.launcher.querySelector('.astan-launcher-badge')) return;
    const badge = document.createElement('span');
    badge.className = 'astan-launcher-badge';
    badge.textContent = '۱';
    this.launcher.appendChild(badge);
  }

  clearNotification(): void {
    this.launcher.querySelector('.astan-launcher-badge')?.remove();
  }

  destroy(): void {
    this.root.remove();
    document.getElementById('astan-assistant-widget-styles')?.remove();
  }
}
