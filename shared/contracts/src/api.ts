import { z } from 'zod';
import { ActionSchema, ActionTargetSchema, RequestableOperationSchema } from './actions.js';
import { PageContextSchema } from './context.js';
import { ErrorCodeSchema } from './errors.js';
import { SystemEventSchema } from './events.js';
import { IntentSchema } from './intents.js';
import { StepIdSchema, WorkflowIdSchema } from './workflow.js';

export const SessionIdSchema = z.string().min(8).max(64);

/** Quick-action buttons rendered by the widget (سند §20). */
export const QuickActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().optional(),
  /** Sent back verbatim as a user message when tapped. */
  message: z.string(),
});
export type QuickAction = z.infer<typeof QuickActionSchema>;

/** Progress data for the «مرحله n از m» indicator (سند §16). */
export const WorkflowViewSchema = z.object({
  workflow_id: WorkflowIdSchema.nullable(),
  workflow_title: z.string().nullable(),
  current_step: StepIdSchema.nullable(),
  next_step: StepIdSchema.nullable(),
  step_title: z.string().nullable(),
  position: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  guided_mode: z.boolean(),
  completed: z.boolean(),
});
export type WorkflowView = z.infer<typeof WorkflowViewSchema>;

/** The Agent Response Contract (سند §25). */
export const AssistantResponseSchema = z.object({
  session_id: SessionIdSchema,
  response: z.object({
    message: z.string(),
    tone: z.enum(['helpful', 'reassuring', 'instructional', 'apologetic']).default('helpful'),
    /** True when the answer came from the knowledge base / workflow, not free
     *  model knowledge — surfaced in the UI and logged (سند §26). */
    grounded: z.boolean().default(true),
  }),
  workflow: WorkflowViewSchema,
  actions: z.array(ActionSchema).max(4),
  quick_actions: z.array(QuickActionSchema).max(6),
  intent: IntentSchema,
  /** Populated when the policy engine dropped actions the model asked for. */
  rejected_actions: z.array(z.object({ action: z.unknown(), reason: z.string() })).default([]),
  human_handoff_offered: z.boolean().default(false),
  source: z.enum(['llm', 'rules', 'llm_fallback_rules']),
});
export type AssistantResponse = z.infer<typeof AssistantResponseSchema>;

/** POST /assistant/session */
export const CreateSessionRequestSchema = z.object({
  context: PageContextSchema.partial().optional(),
});
export const CreateSessionResponseSchema = z.object({
  session_id: SessionIdSchema,
  created_at: z.string(),
});

/** POST /assistant/context */
export const ContextRequestSchema = z.object({
  session_id: SessionIdSchema,
  context: PageContextSchema,
});
export const ContextResponseSchema = z.object({
  session_id: SessionIdSchema,
  workflow: WorkflowViewSchema,
  /** Targets the agent may act on right now = step policy ∩ page reality. */
  allowed_targets: z.array(ActionTargetSchema),
  quick_actions: z.array(QuickActionSchema),
  /** Proactive guidance when guided mode is on. */
  actions: z.array(ActionSchema).max(4),
  message: z.string().nullable(),
});
export type ContextResponse = z.infer<typeof ContextResponseSchema>;

/** POST /assistant/message */
export const MessageRequestSchema = z.object({
  session_id: SessionIdSchema,
  message: z.string().min(1).max(1000),
  context: PageContextSchema,
});

/** POST /assistant/event */
export const EventRequestSchema = z.object({
  session_id: SessionIdSchema,
  event: SystemEventSchema,
  context: PageContextSchema,
  error_code: ErrorCodeSchema.nullable().optional(),
});

/** POST /assistant/operation — host site reports the outcome of a request_operation. */
export const OperationResultRequestSchema = z.object({
  session_id: SessionIdSchema,
  operation: RequestableOperationSchema,
  allowed: z.boolean(),
  reason: z.string().max(200).optional(),
});

/** POST /assistant/feedback — UX metrics (سند §32). */
export const FeedbackRequestSchema = z.object({
  session_id: SessionIdSchema,
  helpful: z.boolean(),
  note: z.string().max(300).optional(),
});

export type MessageRequest = z.infer<typeof MessageRequestSchema>;
export type EventRequest = z.infer<typeof EventRequestSchema>;
export type ContextRequest = z.infer<typeof ContextRequestSchema>;
export type OperationResultRequest = z.infer<typeof OperationResultRequestSchema>;
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
