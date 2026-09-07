import { z } from 'zod';

/**
 * Page IDs (سند §6). The site declares which page it is on; the SDK never
 * infers it from the URL or the DOM, so a page rename cannot silently change
 * what the agent believes it is looking at.
 */
export const PAGE_IDS = [
  'PAGE_HOME',
  'PAGE_LOGIN',
  'PAGE_OTP',
  'PAGE_DASHBOARD',
  'PAGE_NOTIFICATION_LIST',
  'PAGE_NOTIFICATION_DETAIL',
  'PAGE_NOTIFICATION_PRINT',
  'PAGE_UNKNOWN',
] as const;

export const PageIdSchema = z.enum(PAGE_IDS);
export type PageId = z.infer<typeof PageIdSchema>;

/** Human-readable Persian titles, used in guidance text and analytics. */
export const PAGE_TITLES_FA: Record<PageId, string> = {
  PAGE_HOME: 'درگاه خدمات الکترونیک قضایی',
  PAGE_LOGIN: 'سامانه احراز هویت ثنا — ورود',
  PAGE_OTP: 'سامانه احراز هویت ثنا — رمز موقت',
  PAGE_DASHBOARD: 'سامانه ابلاغ الکترونیک قضایی — صفحه اصلی',
  PAGE_NOTIFICATION_LIST: 'فهرست ابلاغیه‌ها',
  PAGE_NOTIFICATION_DETAIL: 'اطلاعات ابلاغیه',
  PAGE_NOTIFICATION_PRINT: 'نسخه چاپی ابلاغیه',
  PAGE_UNKNOWN: 'صفحه نامشخص',
};

/** Routes the agent may navigate to (سند §14 Action 4 — no free-form URLs). */
export const SAFE_ROUTES = [
  '/',
  '/login',
  '/otp',
  '/dashboard',
  '/notifications',
  '/notifications/detail',
  '/help',
  '/support',
] as const;

export const SafeRouteSchema = z.enum(SAFE_ROUTES);
export type SafeRoute = z.infer<typeof SafeRouteSchema>;

/** Which page each safe route lands on — used to validate navigate actions. */
export const ROUTE_TO_PAGE: Record<SafeRoute, PageId> = {
  '/': 'PAGE_HOME',
  '/login': 'PAGE_LOGIN',
  '/otp': 'PAGE_OTP',
  '/dashboard': 'PAGE_DASHBOARD',
  '/notifications': 'PAGE_NOTIFICATION_LIST',
  '/notifications/detail': 'PAGE_NOTIFICATION_DETAIL',
  '/help': 'PAGE_DASHBOARD',
  '/support': 'PAGE_DASHBOARD',
};
