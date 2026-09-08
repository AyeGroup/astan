import { z } from 'zod';

/** MVP intent set (سند §19). */
export const INTENTS = [
  'START_NOTIFICATION_FLOW',
  'VIEW_NOTIFICATION',
  'DOWNLOAD_NOTIFICATION',
  'PRINT_NOTIFICATION',
  'LOGIN_PROBLEM',
  'OTP_NOT_RECEIVED',
  'OTP_INVALID',
  'CANNOT_FIND_NOTIFICATION',
  'PAGE_CONFUSION',
  'WHAT_IS_THIS',
  'NEXT_STEP',
  'PREVIOUS_STEP',
  'REPEAT_INSTRUCTION',
  'SIMPLE_EXPLANATION',
  'HUMAN_SUPPORT',
  'OUT_OF_SCOPE',
  'UNKNOWN',
] as const;

export const IntentSchema = z.enum(INTENTS);
export type Intent = z.infer<typeof IntentSchema>;
