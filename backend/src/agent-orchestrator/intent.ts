import type { Intent, PageContext } from '@astan/contracts';
import { normalizeDigits } from '../policy-engine/sanitizer.js';

/**
 * Deterministic intent detection (سند §2.1).
 *
 * This runs *before* the LLM, not instead of it. Two reasons: a quick-action
 * tap must never cost a model round-trip, and when the model is unavailable
 * the assistant still has to work — a judicial portal cannot go mute because
 * an inference endpoint is down.
 */

function normalize(text: string): string {
  return normalizeDigits(text)
    .replace(/[ىي]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .replace(/‌/g, ' ')
    .replace(/[؟?.!،,:;«»"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

interface Rule {
  intent: Intent;
  phrases: string[];
}

/** Order matters: the first matching rule wins, so specific rules come first. */
const RULES: Rule[] = [
  { intent: 'HUMAN_SUPPORT', phrases: ['پشتیبانی', 'اپراتور', 'انسان', 'کارشناس', 'تماس بگیرم', 'شماره تماس'] },
  { intent: 'OTP_NOT_RECEIVED', phrases: ['رمز نیامد', 'رمز برایم نیامد', 'رمز ارسال نشد', 'پیامک نیامد', 'کد نیامد', 'رمز نرسید', 'رمز برای من ارسال نشده', 'پیامک نشد', 'رمز موقت نیامده'] },
  { intent: 'OTP_INVALID', phrases: ['رمز اشتباه', 'رمز نامعتبر', 'کد اشتباه', 'قبول نمی کند', 'رمز منقضی', 'invalid otp'] },
  { intent: 'LOGIN_PROBLEM', phrases: ['مشکل ورود', 'وارد نمی شوم', 'نمی توانم وارد', 'رمز شخصی', 'رمز عبورم', 'فراموش کرده', 'لاگین'] },
  { intent: 'DOWNLOAD_NOTIFICATION', phrases: ['دانلود', 'ذخیره', 'فایل ابلاغیه', 'pdf', 'بگیرم روی گوشی'] },
  { intent: 'PRINT_NOTIFICATION', phrases: ['چاپ', 'پرینت', 'نسخه چاپی'] },
  { intent: 'CANNOT_FIND_NOTIFICATION', phrases: ['پیدا نمی کنم', 'ابلاغیه نیست', 'کجاست', 'لیست خالی', 'چیزی نمی بینم', 'ابلاغیه ای ندارم'] },
  { intent: 'START_NOTIFICATION_FLOW', phrases: ['قدم به قدم', 'راهنمایی ام کن', 'همراه من', 'شروع کن', 'راهنمای گام'] },
  { intent: 'VIEW_NOTIFICATION', phrases: ['ابلاغیه ام را ببینم', 'ابلاغیه ام را می خواهم', 'ابلاغیه را ببینم', 'دیدن ابلاغیه', 'مشاهده ابلاغیه', 'ابلاغیه ام'] },
  { intent: 'SIMPLE_EXPLANATION', phrases: ['متوجه نشدم', 'نفهمیدم', 'ساده تر', 'یعنی چه', 'واضح تر'] },
  { intent: 'REPEAT_INSTRUCTION', phrases: ['دوباره بگو', 'تکرار کن', 'دوباره توضیح', 'باز هم بگو'] },
  { intent: 'PREVIOUS_STEP', phrases: ['مرحله قبل', 'برگرد', 'قبلی'] },
  { intent: 'NEXT_STEP', phrases: ['بعدش چی', 'مرحله بعد', 'حالا چه کار', 'بعد چی', 'ادامه'] },
  { intent: 'WHAT_IS_THIS', phrases: ['این چیست', 'این صفحه چیست', 'ثنا چیست', 'ابلاغیه چیست', 'این چیه', 'یعنی چی'] },
  { intent: 'PAGE_CONFUSION', phrases: ['گم شدم', 'نمی دانم کجا', 'سردرگم', 'کجا هستم', 'چه کار کنم'] },
];

/** Requests we cannot serve — routed rather than hallucinated (سند §27/10). */
const OUT_OF_SCOPE = ['وکیل', 'شکایت کنم', 'رای دادگاه', 'محکوم', 'قاضی', 'مشاوره حقوقی', 'حکم من', 'پرونده ام چه'];

export interface IntentResult {
  intent: Intent;
  confidence: number;
  matched?: string;
}

export function detectIntent(message: string, context: PageContext): IntentResult {
  const text = normalize(message);
  if (!text) return { intent: 'UNKNOWN', confidence: 0 };

  for (const phrase of OUT_OF_SCOPE) {
    if (text.includes(normalize(phrase))) return { intent: 'OUT_OF_SCOPE', confidence: 0.8, matched: phrase };
  }

  for (const rule of RULES) {
    for (const phrase of rule.phrases) {
      if (text.includes(normalize(phrase))) {
        return { intent: rule.intent, confidence: 0.9, matched: phrase };
      }
    }
  }

  // Context disambiguates a bare "کمک" / "؟" — where the user is tells us what
  // they are stuck on far more reliably than the two words they typed.
  if (text.length <= 12) {
    switch (context.page_id) {
      case 'PAGE_OTP': return { intent: 'OTP_NOT_RECEIVED', confidence: 0.4 };
      case 'PAGE_LOGIN': return { intent: 'LOGIN_PROBLEM', confidence: 0.4 };
      case 'PAGE_NOTIFICATION_LIST': return { intent: 'CANNOT_FIND_NOTIFICATION', confidence: 0.4 };
      case 'PAGE_NOTIFICATION_DETAIL': return { intent: 'DOWNLOAD_NOTIFICATION', confidence: 0.35 };
      default: return { intent: 'PAGE_CONFUSION', confidence: 0.3 };
    }
  }

  return { intent: 'UNKNOWN', confidence: 0.2 };
}

/** Quick actions map to intents directly, with no ambiguity to resolve. */
export const QUICK_ACTION_INTENTS: Record<string, Intent> = {
  qa_guided: 'START_NOTIFICATION_FLOW',
  qa_view_notification: 'VIEW_NOTIFICATION',
  qa_login_problem: 'LOGIN_PROBLEM',
  qa_otp_missing: 'OTP_NOT_RECEIVED',
  qa_not_understood: 'SIMPLE_EXPLANATION',
  qa_repeat: 'REPEAT_INSTRUCTION',
  qa_next: 'NEXT_STEP',
  qa_download: 'DOWNLOAD_NOTIFICATION',
  qa_human: 'HUMAN_SUPPORT',
};
