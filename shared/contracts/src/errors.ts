import { z } from 'zod';

/** Standard error codes the site reports to the assistant (سند §18). */
export const ERROR_CODES = [
  'OTP_NOT_RECEIVED',
  'INVALID_OTP',
  'OTP_EXPIRED',
  'LOGIN_FAILED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'SESSION_EXPIRED',
  'SERVICE_UNAVAILABLE',
  'NETWORK_ERROR',
  'NOTIFICATION_NOT_FOUND',
  'DOWNLOAD_FAILED',
  'UNKNOWN_ERROR',
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Failures that count toward the human-handoff threshold (سند §30). */
export const HANDOFF_WORTHY_ERRORS: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'INVALID_OTP',
  'OTP_EXPIRED',
  'LOGIN_FAILED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'SERVICE_UNAVAILABLE',
  'UNKNOWN_ERROR',
  'DOWNLOAD_FAILED',
]);
