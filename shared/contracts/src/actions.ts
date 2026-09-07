import { z } from 'zod';
import { SafeRouteSchema } from './pages.js';

/**
 * Element targets the agent may point at (سند §14).
 * A target that is not in this list can never be highlighted, scrolled to or
 * tooltipped — regardless of what the model asks for.
 */
export const ACTION_TARGETS = [
  // Home
  'notification_service_card',
  'login_modal_primary_button',
  'services_grid',
  // Login (ثنا)
  'login_form',
  'login_person_type_tabs',
  'login_national_id',
  'login_password',
  'login_submit',
  'login_forgot_password',
  // OTP
  'otp_form',
  'otp_input',
  'otp_submit',
  'otp_resend',
  'otp_back',
  // Dashboard
  'dashboard_tiles',
  'tile_new_notification',
  'tile_viewed_notifications',
  'tile_notification_by_code',
  'tile_notification_by_number',
  'tile_my_services',
  // Notification list
  'notification_list',
  'notification_list_first_row',
  'notification_list_refresh',
  // Notification detail
  'notification_body',
  'notification_print_button',
  'notification_preview_button',
  'notification_attachment_button',
  'notification_more_options',
  'notification_download_button',
  // Global
  'main_header',
  'support_link',
  'logout_button',
] as const;

export const ActionTargetSchema = z.enum(ACTION_TARGETS);
export type ActionTarget = z.infer<typeof ActionTargetSchema>;

/** Help topics for the `open_help` action (سند §14 Action 5, §26). */
export const HELP_TOPICS = [
  'otp_not_received',
  'login_problem',
  'session_expired',
  'find_notification',
  'download_notification',
  'print_notification',
  'service_unavailable',
  'what_is_sana',
  'what_is_notification',
] as const;
export const HelpTopicSchema = z.enum(HELP_TOPICS);
export type HelpTopic = z.infer<typeof HelpTopicSchema>;

/**
 * Privileged operations. The agent may only *request* these; they are executed
 * by the host site after its own validation (سند §14 Action 6, §15).
 */
export const REQUESTABLE_OPERATIONS = ['RESEND_OTP', 'REFRESH_NOTIFICATION_LIST', 'RETRY_DOWNLOAD'] as const;
export const RequestableOperationSchema = z.enum(REQUESTABLE_OPERATIONS);
export type RequestableOperation = z.infer<typeof RequestableOperationSchema>;

/**
 * The complete action whitelist (سند §4). There is deliberately no
 * "execute_script", "read_field" or "submit_form" member: the vocabulary
 * itself is the security boundary, not a runtime check that could be bypassed.
 */
export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('highlight_element'), target: ActionTargetSchema, message: z.string().max(200).optional() }),
  z.object({ type: z.literal('scroll_to_element'), target: ActionTargetSchema }),
  z.object({ type: z.literal('show_tooltip'), target: ActionTargetSchema, message: z.string().max(300) }),
  z.object({ type: z.literal('clear_highlights') }),
  z.object({ type: z.literal('navigate'), route: SafeRouteSchema }),
  z.object({ type: z.literal('open_help'), topic: HelpTopicSchema }),
  z.object({ type: z.literal('show_instruction'), title: z.string().max(120), body: z.string().max(600) }),
  z.object({ type: z.literal('request_operation'), operation: RequestableOperationSchema, requires_confirmation: z.boolean().default(true) }),
  z.object({ type: z.literal('offer_human_support'), reason: z.string().max(200).optional() }),
  z.object({ type: z.literal('start_guided_mode'), workflow_id: z.string().max(64) }),
  z.object({ type: z.literal('stop_guided_mode') }),
]);
export type AssistantAction = z.infer<typeof ActionSchema>;
export type ActionType = AssistantAction['type'];

export const ACTION_TYPES = [
  'highlight_element',
  'scroll_to_element',
  'show_tooltip',
  'clear_highlights',
  'navigate',
  'open_help',
  'show_instruction',
  'request_operation',
  'offer_human_support',
  'start_guided_mode',
  'stop_guided_mode',
] as const satisfies readonly ActionType[];

/** Actions that touch a page element and therefore need a target check. */
export function actionTarget(action: AssistantAction): ActionTarget | null {
  return 'target' in action ? action.target : null;
}
