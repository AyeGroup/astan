import type { ActionTarget, PageContext, PageId } from '@astan/contracts';

export function ctx(page: PageId, targets: ActionTarget[], overrides: Partial<PageContext> = {}): PageContext {
  return {
    page_id: page,
    workflow_id: null,
    current_step: null,
    page_status: 'ACTIVE',
    present_targets: targets,
    system_events: [],
    error_code: null,
    locale: 'fa-IR',
    ...overrides,
  };
}

export const TARGETS: Record<string, ActionTarget[]> = {
  home: ['notification_service_card', 'services_grid', 'support_link'],
  login: ['login_form', 'login_person_type_tabs', 'login_national_id', 'login_password', 'login_submit', 'login_forgot_password'],
  otp: ['otp_form', 'otp_input', 'otp_submit', 'otp_resend', 'otp_back'],
  dashboard: ['dashboard_tiles', 'tile_new_notification', 'tile_viewed_notifications', 'tile_notification_by_code', 'tile_notification_by_number', 'tile_my_services'],
  list: ['notification_list', 'notification_list_first_row', 'notification_list_refresh'],
  detail: ['notification_body', 'notification_print_button', 'notification_preview_button', 'notification_attachment_button', 'notification_more_options'],
  print: ['notification_body', 'notification_download_button', 'notification_print_button'],
};
