import {
  type AssistantAction,
  type PageContext,
  type StepGuidance,
  type StepId,
  type SystemEventType,
  type WorkflowDefinition,
  type WorkflowId,
  type WorkflowState,
  type WorkflowStep,
  type WorkflowView,
} from '@astan/contracts';
import { VIEW_NOTIFICATION } from './definitions/view-notification.js';

const WORKFLOWS: Record<WorkflowId, WorkflowDefinition> = {
  VIEW_NOTIFICATION,
};

export function getWorkflow(id: WorkflowId): WorkflowDefinition {
  return WORKFLOWS[id];
}

export function listWorkflows(): WorkflowDefinition[] {
  return Object.values(WORKFLOWS);
}

export function emptyState(): WorkflowState {
  return {
    workflow_id: null,
    current_step: null,
    started_at: null,
    updated_at: new Date().toISOString(),
    last_event: null,
    completed: false,
    guided_mode: false,
    failure_count: 0,
  };
}

export function startWorkflow(id: WorkflowId, guided: boolean): WorkflowState {
  const def = getWorkflow(id);
  const now = new Date().toISOString();
  return {
    workflow_id: id,
    current_step: def.initial_step,
    started_at: now,
    updated_at: now,
    last_event: null,
    completed: false,
    guided_mode: guided,
    failure_count: 0,
  };
}

export function getStep(state: WorkflowState): WorkflowStep | null {
  if (!state.workflow_id || !state.current_step) return null;
  return getWorkflow(state.workflow_id).steps[state.current_step] ?? null;
}

/**
 * Advance the state machine. Only declared transitions are honoured — an event
 * that is not in the current step's transition table is ignored rather than
 * guessed at, which keeps a noisy or replayed event from teleporting the user.
 */
export function applyEvent(state: WorkflowState, event: SystemEventType): WorkflowState {
  if (!state.workflow_id || !state.current_step) return state;
  const def = getWorkflow(state.workflow_id);
  const step = def.steps[state.current_step];
  if (!step) return state;

  const next = step.transitions[event];
  const now = new Date().toISOString();
  if (!next) {
    return { ...state, last_event: event, updated_at: now };
  }

  const failed = event === 'LOGIN_FAILED' || event === 'OTP_FAILED';
  const movedForward = next !== state.current_step;
  const nextStep = def.steps[next];

  return {
    ...state,
    current_step: next,
    last_event: event,
    updated_at: now,
    completed: nextStep?.terminal ?? false,
    failure_count: failed ? state.failure_count + 1 : movedForward ? 0 : state.failure_count,
  };
}

/**
 * Reconcile workflow state with where the user actually is (سند §22).
 * If the page contradicts the recorded step — a back button, a bookmark, a
 * session timeout — the page wins, because the page is ground truth.
 */
export function reconcileWithPage(state: WorkflowState, context: PageContext): WorkflowState {
  if (!state.workflow_id || !state.current_step) return state;
  const def = getWorkflow(state.workflow_id);
  const step = def.steps[state.current_step];
  if (!step) return state;
  if (step.expected_pages.includes(context.page_id)) return state;

  const match = Object.values(def.steps).find(
    (s) => s && !s.terminal && s.expected_pages.includes(context.page_id),
  );
  if (!match || match.step_id === state.current_step) return state;

  return {
    ...state,
    current_step: match.step_id,
    updated_at: new Date().toISOString(),
    failure_count: 0,
    completed: false,
  };
}

export function nextStepId(state: WorkflowState): StepId | null {
  const step = getStep(state);
  if (!step || !state.workflow_id) return null;
  const def = getWorkflow(state.workflow_id);
  const ordered = Object.values(def.steps)
    .filter((s): s is WorkflowStep => Boolean(s))
    .sort((a, b) => a.order - b.order);
  const idx = ordered.findIndex((s) => s.step_id === step.step_id);
  return ordered[idx + 1]?.step_id ?? null;
}

export function progress(state: WorkflowState): { position: number; total: number } {
  if (!state.workflow_id || !state.current_step) return { position: 0, total: 0 };
  const def = getWorkflow(state.workflow_id);
  const total = def.visible_steps.length;
  const idx = def.visible_steps.indexOf(state.current_step);
  if (idx >= 0) return { position: idx + 1, total };
  // START sits before the visible steps; COMPLETED sits after them.
  return { position: state.completed ? total : 0, total };
}

export function toView(state: WorkflowState): WorkflowView {
  const step = getStep(state);
  const def = state.workflow_id ? getWorkflow(state.workflow_id) : null;
  const { position, total } = progress(state);
  return {
    workflow_id: state.workflow_id,
    workflow_title: def?.title ?? null,
    current_step: state.current_step,
    next_step: nextStepId(state),
    step_title: step?.title ?? null,
    position,
    total,
    guided_mode: state.guided_mode,
    completed: state.completed,
  };
}

/**
 * The guidance bundle for the current step: what to say and which element to
 * point at. This is what makes the assistant a guide rather than a chatbot.
 */
export function stepGuidance(state: WorkflowState, context: PageContext): StepGuidance | null {
  const step = getStep(state);
  if (!step) return null;
  const { position, total } = progress(state);
  const actions: AssistantAction[] = [];

  const onExpectedPage = step.expected_pages.includes(context.page_id);
  if (onExpectedPage && step.primary_target && context.present_targets.includes(step.primary_target)) {
    actions.push({ type: 'scroll_to_element', target: step.primary_target });
    actions.push({ type: 'highlight_element', target: step.primary_target, message: step.title });
  } else if (!onExpectedPage) {
    const route = pageToRoute(step.expected_pages[0]);
    if (route) actions.push({ type: 'navigate', route });
  }

  return { step, next_step: nextStepId(state), position, total, suggested_actions: actions };
}

function pageToRoute(page: string | undefined): '/login' | '/otp' | '/dashboard' | '/notifications' | '/notifications/detail' | '/' | null {
  switch (page) {
    case 'PAGE_LOGIN': return '/login';
    case 'PAGE_OTP': return '/otp';
    case 'PAGE_DASHBOARD': return '/dashboard';
    case 'PAGE_NOTIFICATION_LIST': return '/notifications';
    case 'PAGE_NOTIFICATION_DETAIL': return '/notifications/detail';
    case 'PAGE_HOME': return '/';
    default: return null;
  }
}

export { VIEW_NOTIFICATION };
