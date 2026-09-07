import { ActionController } from './action-controller/index.js';
import { PageContextEngine } from './page-context/index.js';
import { Transport } from './transport.js';
import { AssistantWidget } from './widget/index.js';
import type {
  AssistantAction,
  AssistantResponse,
  ContextResponse,
  EventResponse,
  QuickAction,
  SdkOptions,
  SystemEvent,
} from './types.js';

/**
 * Judicial Assistant SDK (سند §5).
 *
 * The single integration surface for the portal:
 *   AssistantSDK.init({ apiBase, pageId })
 *   AssistantSDK.setPage('PAGE_OTP')
 *   AssistantSDK.emit({ type: 'OTP_SENT' })
 *   AssistantSDK.reportError('OTP_NOT_RECEIVED')
 *
 * Everything else — highlighting, tooltips, the widget, session handling — is
 * internal. The host never has to know how the agent decides anything.
 */
class JudicialAssistantSDK {
  private options: SdkOptions | null = null;
  private transport: Transport | null = null;
  private context: PageContextEngine | null = null;
  private controller: ActionController | null = null;
  private widget: AssistantWidget | null = null;
  private syncing = false;
  private started = false;
  private lastFingerprint = '';
  private lastSyncAt = 0;
  private syncTimer: number | undefined;
  private guidedMode = false;

  init(options: SdkOptions): void {
    if (this.started) {
      this.setPage(options.pageId);
      return;
    }
    this.started = true;
    this.options = options;
    this.transport = new Transport(options.apiBase.replace(/\/$/, ''), options.debug ?? false);
    this.transport.restoreSession();
    this.context = new PageContextEngine(options.pageId);

    this.widget = new AssistantWidget({
      onSend: (message) => void this.send(message),
      onQuickAction: (action) => void this.send(action.message),
      onOperationConfirm: (operation, confirmed) => void this.runOperation(operation, confirmed),
      onFeedback: (helpful) => void this.transport?.sendFeedback(helpful).catch(() => undefined),
      onOpen: () => {
        this.widget?.clearNotification();
        void this.syncContext(true);
      },
      onClose: () => this.controller?.clear(this.guidedMode),
    });

    this.controller = new ActionController(options, {
      onInstruction: (title, body) => this.widget?.addMessage('assistant', `${title}\n${body}`),
      onHelp: (topic) => this.widget?.addMessage('system', `راهنمای مرتبط: ${topic}`),
      onOperationRequested: (operation, requiresConfirmation) => {
        if (!requiresConfirmation) {
          void this.runOperation(operation, true);
          return;
        }
        this.widget?.requestConfirmation(operation, confirmationPrompt(operation));
      },
      onHumanSupport: () => options.onHumanSupport?.(),
      onGuidedMode: (enabled) => {
        this.guidedMode = enabled;
        if (!enabled) this.controller?.clear();
      },
    });

    this.widget.addMessage(
      'assistant',
      'سلام. من راهنمای هوشمند این سامانه هستم. بگویید می‌خواهید چه کاری انجام دهید تا قدم‌به‌قدم همراهتان باشم.',
    );

    this.context.observe(() => void this.syncContext());
    void this.syncContext();

    if (options.autoOpen) this.widget.setOpen(true);
  }

  /** Called by the host on every page/view change (سند §6). */
  setPage(pageId: string): void {
    if (!this.context) return;
    this.context.setPage(pageId);
    this.controller?.clear();
    // A page change invalidates the throttle: guidance must land immediately.
    void this.syncContext(true);
  }

  setStatus(status: 'ACTIVE' | 'LOADING' | 'ERROR'): void {
    this.context?.setStatus(status);
  }

  /** Emit a workflow event (سند §11). */
  emit(event: SystemEvent | string): void {
    const payload: SystemEvent = typeof event === 'string' ? { type: event } : event;
    if (!this.transport || !this.context) return;
    this.context.recordEvent(payload);
    void this.transport
      .sendEvent(payload, this.context.snapshot())
      .then((res) => this.applyEventResponse(res))
      .catch(() => undefined);
  }

  /** Report a standard error code (سند §18). */
  reportError(code: string | null): void {
    if (!this.context || !this.transport) return;
    this.context.setError(code);
    if (!code) return;
    void this.transport
      .sendEvent({ type: 'PAGE_VIEWED' }, this.context.snapshot(), code)
      .then((res) => {
        this.applyEventResponse(res);
        this.widget?.notify();
      })
      .catch(() => undefined);
  }

  open(): void { this.widget?.setOpen(true); }
  close(): void { this.widget?.setOpen(false); }

  destroy(): void {
    this.context?.disconnect();
    this.controller?.clear();
    this.widget?.destroy();
    this.started = false;
  }

  private async syncContext(force = false): Promise<void> {
    if (!this.transport || !this.context || this.syncing) return;
    const snapshot = this.context.snapshot();
    // Two guards against chatty pages: skip a sync whose context is identical
    // to the last one, and never sync more than once per second.
    const fingerprint = `${snapshot.page_id}|${snapshot.page_status}|${snapshot.error_code}|${snapshot.present_targets.join(',')}`;
    const now = Date.now();
    if (!force && fingerprint === this.lastFingerprint && now - this.lastSyncAt < 30_000) return;
    if (!force && now - this.lastSyncAt < 1000) {
      // Throttled, not dropped: a page that renders its target late must still
      // get guidance, just a beat later.
      window.clearTimeout(this.syncTimer);
      this.syncTimer = window.setTimeout(() => void this.syncContext(), 1000 - (now - this.lastSyncAt));
      return;
    }
    this.lastFingerprint = fingerprint;
    this.lastSyncAt = now;
    this.syncing = true;
    try {
      const res: ContextResponse = await this.transport.sendContext(snapshot);
      this.context.setWorkflow(res.workflow.workflow_id, res.workflow.current_step);
      this.guidedMode = res.workflow.guided_mode;
      this.controller?.setAllowedTargets(res.allowed_targets);
      this.widget?.setWorkflow(res.workflow);
      this.widget?.setQuickActions(res.quick_actions);
      // Guided mode keeps pointing even with the panel collapsed — that is the
      // mode the user asked for. Otherwise we only act while they are looking.
      if (res.actions.length > 0 && (res.workflow.guided_mode || this.widget?.isOpen)) {
        this.controller?.execute(res.actions);
      }
    } catch (error) {
      if (this.options?.debug) console.warn('[AssistantSDK] context sync failed', error);
    } finally {
      this.syncing = false;
    }
  }

  private async send(message: string): Promise<void> {
    if (!this.transport || !this.context || !this.widget) return;
    this.widget.setTyping(true);
    try {
      const res: AssistantResponse = await this.transport.sendMessage(message, this.context.snapshot());
      this.widget.setTyping(false);
      this.widget.addMessage('assistant', res.response.message);
      this.widget.setWorkflow(res.workflow);
      this.widget.setQuickActions(res.quick_actions);
      this.context.setWorkflow(res.workflow.workflow_id, res.workflow.current_step);
      this.guidedMode = res.workflow.guided_mode;
      this.applyActions(res.actions);
    } catch {
      this.widget.setTyping(false);
      this.widget.addMessage(
        'system',
        'ارتباط با راهنما برقرار نشد. لطفاً چند لحظه بعد دوباره تلاش کنید. کار شما در سامانه ادامه دارد.',
      );
    }
  }

  private applyEventResponse(res: EventResponse): void {
    this.context?.setWorkflow(res.workflow.workflow_id, res.workflow.current_step);
    this.guidedMode = res.workflow.guided_mode;
    this.widget?.setWorkflow(res.workflow);
    this.widget?.setQuickActions(res.quick_actions);
    if (res.message) {
      this.widget?.addMessage('assistant', res.message);
      if (!this.widget?.isOpen) this.widget?.notify();
    }
    this.applyActions(res.actions);
  }

  private applyActions(actions: AssistantAction[]): void {
    if (actions.length === 0 || !this.context) return;
    // Re-derive the allowed set from the live DOM before executing, so an
    // element that disappeared between request and response is not targeted.
    this.controller?.setAllowedTargets(this.context.snapshot().present_targets);
    this.controller?.execute(actions);
  }

  /**
   * Privileged operation round-trip (سند §14/6، §15): the host decides, the
   * assistant only relays the outcome back to the user.
   */
  private async runOperation(operation: string, confirmed: boolean): Promise<void> {
    if (!confirmed) {
      this.widget?.addMessage('system', 'انجام نشد. هر وقت خواستید بگویید.');
      await this.transport?.reportOperation(operation, false, 'user_declined').catch(() => undefined);
      return;
    }
    const handler = this.options?.onOperationRequest;
    if (!handler) {
      this.widget?.addMessage('system', 'این عملیات در این صفحه پشتیبانی نمی‌شود.');
      return;
    }
    try {
      const allowed = await handler(operation);
      this.widget?.addMessage(
        'system',
        allowed ? 'درخواست شما به سامانه ارسال شد.' : 'سامانه فعلاً اجازه این کار را نداد.',
      );
      await this.transport?.reportOperation(operation, allowed).catch(() => undefined);
    } catch {
      this.widget?.addMessage('system', 'انجام این درخواست ممکن نشد.');
      await this.transport?.reportOperation(operation, false, 'host_error').catch(() => undefined);
    }
  }
}

function confirmationPrompt(operation: string): string {
  switch (operation) {
    case 'RESEND_OTP': return 'رمز موقت دوباره برای شما ارسال شود؟';
    case 'REFRESH_NOTIFICATION_LIST': return 'فهرست ابلاغیه‌ها دوباره بارگذاری شود؟';
    case 'RETRY_DOWNLOAD': return 'دریافت ابلاغیه دوباره تلاش شود؟';
    default: return 'این کار انجام شود؟';
  }
}

const sdk = new JudicialAssistantSDK();
export default sdk;
export type { SdkOptions, SystemEvent };
