import { z } from 'zod';
import { ActionTargetSchema, type AssistantAction } from './actions.js';
import { ErrorCodeSchema } from './errors.js';
import { SystemEventTypeSchema } from './events.js';
import { PageIdSchema } from './pages.js';

export const WorkflowIdSchema = z.enum(['VIEW_NOTIFICATION']);
export type WorkflowId = z.infer<typeof WorkflowIdSchema>;

export const StepIdSchema = z.enum([
  'START',
  'LOGIN',
  'OTP_VERIFICATION',
  'AUTHENTICATED',
  'NOTIFICATION_LIST',
  'NOTIFICATION_DETAIL',
  'DOWNLOAD_OR_VIEW',
  'COMPLETED',
]);
export type StepId = z.infer<typeof StepIdSchema>;

/** A single node of the workflow state machine (سند §9، §10). */
export const WorkflowStepSchema = z.object({
  step_id: StepIdSchema,
  title: z.string(),
  description: z.string(),
  /** Short, jargon-free restatement used by the «متوجه نشدم» flow (سند §21). */
  simple_description: z.string(),
  /** Which page the user is expected to be on for this step. */
  expected_pages: z.array(PageIdSchema),
  /** Element targets the agent is allowed to point at while on this step. */
  allowed_targets: z.array(ActionTargetSchema),
  /** The element to highlight first when the step becomes active. */
  primary_target: ActionTargetSchema.nullable(),
  /** Events that move the workflow forward, mapped to the next step. */
  transitions: z.record(SystemEventTypeSchema, StepIdSchema),
  /** Errors that can legitimately occur here. */
  error_events: z.array(ErrorCodeSchema),
  /** Zero-based index, for the «مرحله n از m» progress display. */
  order: z.number().int().nonnegative(),
  /** Terminal step of the workflow. */
  terminal: z.boolean().default(false),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowDefinitionSchema = z.object({
  workflow_id: WorkflowIdSchema,
  title: z.string(),
  description: z.string(),
  initial_step: StepIdSchema,
  /** Steps shown in the progress bar (START/COMPLETED are not user-visible). */
  visible_steps: z.array(StepIdSchema),
  steps: z.record(StepIdSchema, WorkflowStepSchema),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

/** Runtime state of one user's journey through a workflow (سند §23). */
export const WorkflowStateSchema = z.object({
  workflow_id: WorkflowIdSchema.nullable(),
  current_step: StepIdSchema.nullable(),
  started_at: z.string().nullable(),
  updated_at: z.string(),
  last_event: SystemEventTypeSchema.nullable(),
  completed: z.boolean(),
  guided_mode: z.boolean(),
  /** Consecutive failures on the current step — drives human handoff (§30). */
  failure_count: z.number().int().nonnegative(),
});
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

export interface StepGuidance {
  step: WorkflowStep;
  next_step: StepId | null;
  position: number;
  total: number;
  suggested_actions: AssistantAction[];
}
