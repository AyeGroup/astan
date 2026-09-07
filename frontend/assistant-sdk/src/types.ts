/**
 * Wire types, declared locally rather than imported from @astan/contracts.
 *
 * The SDK is bundled into third-party pages, so it carries no zod runtime and
 * no build-time dependency on the backend package. The two definitions are
 * kept in sync by `npm run typecheck:contracts` in CI, which type-checks these
 * against the canonical schemas.
 */
export type ActionTarget = string;

export type AssistantAction =
  | { type: 'highlight_element'; target: ActionTarget; message?: string }
  | { type: 'scroll_to_element'; target: ActionTarget }
  | { type: 'show_tooltip'; target: ActionTarget; message: string }
  | { type: 'clear_highlights' }
  | { type: 'navigate'; route: string }
  | { type: 'open_help'; topic: string }
  | { type: 'show_instruction'; title: string; body: string }
  | { type: 'request_operation'; operation: string; requires_confirmation?: boolean }
  | { type: 'offer_human_support'; reason?: string }
  | { type: 'start_guided_mode'; workflow_id: string }
  | { type: 'stop_guided_mode' };

export interface SystemEvent {
  type: string;
  workflow_id?: string;
  meta?: Record<string, string | number | boolean>;
  occurred_at?: string;
}

export interface PageContext {
  page_id: string;
  workflow_id: string | null;
  current_step: string | null;
  page_status: 'ACTIVE' | 'LOADING' | 'ERROR';
  present_targets: ActionTarget[];
  system_events: SystemEvent[];
  error_code: string | null;
  locale: 'fa-IR';
}

export interface WorkflowView {
  workflow_id: string | null;
  workflow_title: string | null;
  current_step: string | null;
  next_step: string | null;
  step_title: string | null;
  position: number;
  total: number;
  guided_mode: boolean;
  completed: boolean;
}

export interface QuickAction {
  id: string;
  label: string;
  icon?: string;
  message: string;
}

export interface AssistantResponse {
  session_id: string;
  response: { message: string; tone: string; grounded: boolean };
  workflow: WorkflowView;
  actions: AssistantAction[];
  quick_actions: QuickAction[];
  intent: string;
  human_handoff_offered: boolean;
  source: string;
}

export interface ContextResponse {
  session_id: string;
  workflow: WorkflowView;
  allowed_targets: ActionTarget[];
  quick_actions: QuickAction[];
  actions: AssistantAction[];
  message: string | null;
}

export interface EventResponse {
  session_id: string;
  workflow: WorkflowView;
  actions: AssistantAction[];
  message: string | null;
  quick_actions: QuickAction[];
}

export interface SdkOptions {
  /** Assistant API base URL, e.g. https://assistant.example.ir */
  apiBase: string;
  /** Page identifier from the agreed enum — never inferred from the URL. */
  pageId: string;
  /**
   * Host hook for navigation. The SDK will not touch location itself: the
   * portal owns its router, and a hard redirect could drop an in-flight form.
   */
  onNavigate?: (route: string) => void;
  /**
   * Host hook for privileged operations (e.g. RESEND_OTP). The assistant can
   * only ask; this callback is where the site applies its own rules.
   */
  onOperationRequest?: (operation: string) => Promise<boolean> | boolean;
  onHumanSupport?: () => void;
  /** Open the widget automatically on first load. */
  autoOpen?: boolean;
  debug?: boolean;
}
