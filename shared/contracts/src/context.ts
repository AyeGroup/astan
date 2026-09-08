import { z } from 'zod';
import { ActionTargetSchema } from './actions.js';
import { ErrorCodeSchema } from './errors.js';
import { SystemEventSchema } from './events.js';
import { PageIdSchema } from './pages.js';
import { StepIdSchema, WorkflowIdSchema } from './workflow.js';

/**
 * The Context Contract (سند §7). This is the ONLY channel between the site and
 * the agent. Note what is absent: no DOM, no form values, no tokens, no
 * identity — by construction, not by filtering (سند §8).
 */
export const PageContextSchema = z.object({
  page_id: PageIdSchema,
  workflow_id: WorkflowIdSchema.nullable().default(null),
  current_step: StepIdSchema.nullable().default(null),
  page_status: z.enum(['ACTIVE', 'LOADING', 'ERROR']).default('ACTIVE'),
  /** Targets the host page actually rendered — intersected with step policy. */
  present_targets: z.array(ActionTargetSchema).default([]),
  /** Recent events, newest last. Bounded to keep the payload small. */
  system_events: z.array(SystemEventSchema).max(20).default([]),
  error_code: ErrorCodeSchema.nullable().default(null),
  /** Non-identifying UI locale hint. */
  locale: z.enum(['fa-IR']).default('fa-IR'),
});
export type PageContext = z.infer<typeof PageContextSchema>;
