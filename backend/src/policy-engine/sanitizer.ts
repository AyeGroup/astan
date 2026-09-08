/**
 * Outbound scrubber (سند §8). Nothing reaches the model without passing here.
 *
 * The architecture already keeps secrets out of the context contract — the SDK
 * has no way to read a form field. This layer is the belt to that suspenders:
 * it catches anything a user types into the chat box, where they very much can
 * paste an OTP or a national ID despite being told not to.
 */

export interface SanitizeResult {
  text: string;
  redactions: string[];
}

interface Rule {
  name: string;
  pattern: RegExp;
  replace: (match: string) => string;
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Normalise Persian/Arabic digits so the detectors see one alphabet. */
export function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const fa = FA_DIGITS.indexOf(ch);
    if (fa >= 0) return String(fa);
    return String(AR_DIGITS.indexOf(ch));
  });
}

const RULES: Rule[] = [
  {
    // Iranian mobile numbers — keep the shape, drop the identity (سند §8).
    name: 'mobile',
    pattern: /(?:\+?98|0)9\d{9}\b/g,
    replace: (m) => `09******${m.slice(-4)}`,
  },
  {
    // Bank card numbers (16 digits, optionally grouped).
    name: 'bank_card',
    pattern: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g,
    replace: () => '****-****-****-****',
  },
  {
    // National ID (کد ملی) — exactly 10 digits.
    name: 'national_id',
    pattern: /(?<!\d)\d{10}(?!\d)/g,
    replace: (m) => `******${m.slice(-4)}`,
  },
  {
    // A bare 4–8 digit run next to OTP wording is almost certainly the code.
    name: 'otp',
    pattern: /(رمز|کد|پسورد|otp|code|pass)\D{0,12}(\d{4,8})(?!\d)/gi,
    replace: (m) => m.replace(/\d{4,8}(?!\d)/, '[کد-حذف-شد]'),
  },
  {
    // Long opaque strings: JWTs, session tokens, API keys.
    name: 'token',
    pattern: /\b(?:eyJ[A-Za-z0-9_-]{10,}|[A-Za-z0-9_-]{32,})\b/g,
    replace: () => '[توکن-حذف-شد]',
  },
];

/**
 * Mask sensitive values in free text. Returns the masked text plus the list of
 * rule names that fired, so the orchestrator can tell the user we dropped it
 * and analytics can count how often it happens.
 */
export function sanitizeUserText(input: string): SanitizeResult {
  const normalized = normalizeDigits(input);
  const redactions: string[] = [];
  let text = normalized;
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    if (!rule.pattern.test(text)) continue;
    rule.pattern.lastIndex = 0;
    text = text.replace(rule.pattern, (m) => rule.replace(m));
    redactions.push(rule.name);
  }
  return { text, redactions };
}

/** True when the user pasted something we must refuse to work with. */
export function containsCredentials(redactions: string[]): boolean {
  return redactions.some((r) => r === 'otp' || r === 'token' || r === 'bank_card' || r === 'national_id');
}
