import {
  ActionSchema,
  ROUTE_TO_PAGE,
  type ActionTarget,
  type AssistantAction,
  type PageContext,
  type WorkflowState,
} from '@astan/contracts';
import { getStep } from '../workflow-engine/index.js';

/**
 * Policy Engine (سند §15، §39).
 *
 * The model proposes; this module disposes. Every action — whether it came
 * from the LLM or from our own rule engine — is re-validated here against
 * four questions: is the action shape legal, is the target allowed on this
 * step, is the target actually on the page, and does it need confirmation.
 */

export interface PolicyDecision {
  allowed: AssistantAction[];
  rejected: { action: unknown; reason: string }[];
}

export interface PolicyInput {
  actions: unknown[];
  state: WorkflowState;
  context: PageContext;
}

/**
 * Targets the agent may act on right now: the step's declared whitelist
 * intersected with what the page reports it actually rendered. The
 * intersection matters — a step may allow `otp_resend`, but if the site did
 * not render a resend button we must not point at empty space.
 */
export function allowedTargets(state: WorkflowState, context: PageContext): ActionTarget[] {
  const step = getStep(state);
  if (!step) return [];
  const present = new Set(context.present_targets);
  return step.allowed_targets.filter((t) => present.has(t));
}

/** Operations that always require the user to confirm before we ask the site. */
const CONFIRM_REQUIRED = new Set(['RESEND_OTP', 'RETRY_DOWNLOAD']);

export function enforce({ actions, state, context }: PolicyInput): PolicyDecision {
  const allowed: AssistantAction[] = [];
  const rejected: { action: unknown; reason: string }[] = [];
  const targets = new Set(allowedTargets(state, context));
  const step = getStep(state);

  for (const raw of actions) {
    const parsed = ActionSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ action: raw, reason: `اکشن خارج از فهرست مجاز است: ${parsed.error.issues[0]?.message ?? 'invalid'}` });
      continue;
    }
    const action = parsed.data;

    // 1) Element actions: the target must be allowed on this step AND present.
    if (action.type === 'highlight_element' || action.type === 'scroll_to_element' || action.type === 'show_tooltip') {
      if (!step) {
        rejected.push({ action, reason: 'هیچ Workflow فعالی وجود ندارد.' });
        continue;
      }
      if (!step.allowed_targets.includes(action.target)) {
        rejected.push({ action, reason: `هدف «${action.target}» در مرحله ${step.step_id} مجاز نیست.` });
        continue;
      }
      if (!targets.has(action.target)) {
        rejected.push({ action, reason: `هدف «${action.target}» در صفحه فعلی وجود ندارد.` });
        continue;
      }
    }

    // 2) Navigation: only to declared safe routes, and never in a circle.
    if (action.type === 'navigate') {
      const destination = ROUTE_TO_PAGE[action.route];
      if (destination === context.page_id) {
        rejected.push({ action, reason: 'کاربر هم‌اکنون در همین صفحه است.' });
        continue;
      }
    }

    // 3) Privileged operations are requests, never executions (سند §14/6).
    if (action.type === 'request_operation') {
      if (CONFIRM_REQUIRED.has(action.operation) && action.requires_confirmation === false) {
        allowed.push({ ...action, requires_confirmation: true });
        continue;
      }
      if (action.operation === 'RESEND_OTP' && state.current_step !== 'OTP_VERIFICATION') {
        rejected.push({ action, reason: 'ارسال مجدد رمز فقط در مرحله رمز موقت مجاز است.' });
        continue;
      }
    }

    allowed.push(action);
  }

  // 4) Cap the action budget so one turn cannot flood the page with UI.
  if (allowed.length > 4) {
    for (const extra of allowed.slice(4)) rejected.push({ action: extra, reason: 'سقف تعداد اکشن در هر پاسخ ۴ مورد است.' });
  }

  return { allowed: allowed.slice(0, 4), rejected };
}

/** Whether we should proactively offer a human (سند §30). */
export function shouldOfferHumanHandoff(state: WorkflowState, context: PageContext): boolean {
  if (state.failure_count >= 3) return true;
  return context.error_code === 'UNKNOWN_ERROR' || context.error_code === 'ACCOUNT_LOCKED';
}

export * from './sanitizer.js';
