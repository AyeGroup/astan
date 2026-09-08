import { z } from 'zod';

/**
 * System events the host site emits through the SDK (سند §11).
 * Events are the ONLY way workflow state advances — the agent never
 * guesses that a step completed.
 */
export const SYSTEM_EVENTS = [
  'PAGE_VIEWED',
  'LOGIN_PAGE_OPENED',
  'LOGIN_SUBMITTED',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'OTP_REQUESTED',
  'OTP_SENT',
  'OTP_SUBMITTED',
  'OTP_VERIFIED',
  'OTP_FAILED',
  'OTP_RESEND_REQUESTED',
  'DASHBOARD_LOADED',
  'NOTIFICATION_LIST_LOADED',
  'NOTIFICATION_OPENED',
  'NOTIFICATION_EMPTY',
  'DOWNLOAD_STARTED',
  'DOWNLOAD_COMPLETED',
  'PRINT_OPENED',
  'SESSION_EXPIRED_EVENT',
  'USER_LOGGED_OUT',
] as const;

export const SystemEventTypeSchema = z.enum(SYSTEM_EVENTS);
export type SystemEventType = z.infer<typeof SystemEventTypeSchema>;

/**
 * Event payloads are deliberately narrow: counters and enums only.
 * No free-form strings from forms ever ride along (سند §8).
 */
export const SystemEventSchema = z.object({
  type: SystemEventTypeSchema,
  workflow_id: z.string().optional(),
  /** Non-sensitive numeric/boolean/enum metadata only. */
  meta: z.record(z.union([z.number(), z.boolean(), z.string().max(64)])).optional(),
  occurred_at: z.string().datetime().optional(),
});
export type SystemEvent = z.infer<typeof SystemEventSchema>;
