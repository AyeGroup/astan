import {
  type AssistantAction,
  type Intent,
  type PageContext,
  type QuickAction,
  type WorkflowState,
} from '@astan/contracts';
import { findByErrorCode, findByIntent, search, type Article } from '../knowledge-base/index.js';
import { allowedTargets } from '../policy-engine/index.js';
import { getStep, nextStepId, stepGuidance } from '../workflow-engine/index.js';
import type { AssistantSession } from '../session/store.js';

/**
 * Rule-based responder (سند §12).
 *
 * Produces a complete, grounded answer for every intent using only the
 * workflow definition and the knowledge base. The LLM layer sits on top of
 * this and rewrites the wording; if the LLM is unavailable or returns
 * something the policy engine rejects, this output ships as-is. That is the
 * difference between a degraded assistant and a dead one.
 */

export interface RuleAnswer {
  message: string;
  tone: 'helpful' | 'reassuring' | 'instructional' | 'apologetic';
  actions: AssistantAction[];
  grounded: boolean;
  /** Articles used — handed to the LLM as its only permitted source. */
  sources: Article[];
  instruction: { title: string; body: string; simple: string } | null;
  startWorkflow?: 'VIEW_NOTIFICATION';
  guided?: boolean;
}

function pointAt(state: WorkflowState, context: PageContext, withTooltip?: string): AssistantAction[] {
  const step = getStep(state);
  if (!step?.primary_target) return [];
  const available = allowedTargets(state, context);
  if (!available.includes(step.primary_target)) return [];
  const actions: AssistantAction[] = [
    { type: 'scroll_to_element', target: step.primary_target },
    { type: 'highlight_element', target: step.primary_target, message: step.title },
  ];
  if (withTooltip) actions.push({ type: 'show_tooltip', target: step.primary_target, message: withTooltip });
  return actions;
}

function articleAnswer(article: Article, simple: boolean): Pick<RuleAnswer, 'message' | 'sources' | 'instruction' | 'grounded'> {
  return {
    message: simple ? article.simple_body : article.body,
    sources: [article],
    grounded: true,
    instruction: { title: article.title, body: article.body, simple: article.simple_body },
  };
}

export function answer(
  intent: Intent,
  message: string,
  session: AssistantSession,
  context: PageContext,
): RuleAnswer {
  const state = session.workflow;
  const step = getStep(state);
  const available = allowedTargets(state, context);

  switch (intent) {
    case 'START_NOTIFICATION_FLOW':
    case 'VIEW_NOTIFICATION': {
      return {
        message:
          'حتماً. قدم‌به‌قدم همراهتان هستم تا ابلاغیه را ببینید. در هر مرحله همان چیزی را که باید بزنید برایتان مشخص می‌کنم.',
        tone: 'helpful',
        actions: [],
        grounded: true,
        sources: [],
        instruction: null,
        startWorkflow: 'VIEW_NOTIFICATION',
        guided: true,
      };
    }

    case 'NEXT_STEP': {
      if (!step) {
        return {
          message: 'هنوز فرآیندی شروع نشده است. اگر می‌خواهید ابلاغیه‌تان را ببینید، بگویید «ابلاغیه‌ام را ببینم» تا از ابتدا همراهتان باشم.',
          tone: 'helpful', actions: [], grounded: true, sources: [], instruction: null,
        };
      }
      const next = nextStepId(state);
      const guidance = stepGuidance(state, context);
      return {
        message: `${step.description}${next ? `\n\nمرحله بعد: ${step.title === 'پایان فرآیند' ? '' : ''}` : ''}`.trim(),
        tone: 'instructional',
        actions: guidance?.suggested_actions ?? pointAt(state, context),
        grounded: true,
        sources: [],
        instruction: { title: step.title, body: step.description, simple: step.simple_description },
      };
    }

    case 'PREVIOUS_STEP': {
      return {
        message:
          'برای برگشتن به مرحله قبل از دکمه‌های خود سامانه استفاده کنید (مثلاً «مرحله قبل»). من مرحله‌ای را به‌جای شما تغییر نمی‌دهم، اما در هر مرحله‌ای که باشید راهنمایی‌تان می‌کنم.',
        tone: 'helpful', actions: [], grounded: true, sources: [], instruction: null,
      };
    }

    case 'REPEAT_INSTRUCTION': {
      const last = session.last_instruction;
      if (last) {
        return {
          message: last.body,
          tone: 'instructional',
          actions: pointAt(state, context),
          grounded: true, sources: [], instruction: last,
        };
      }
      break;
    }

    case 'SIMPLE_EXPLANATION': {
      // «متوجه نشدم» (سند §21): restate simpler and point at the element.
      const last = session.last_instruction;
      if (last) {
        return {
          message: `${last.simple}${step?.primary_target && available.includes(step.primary_target) ? '\nآن را برای شما مشخص کرده‌ام 👇' : ''}`,
          tone: 'reassuring',
          actions: pointAt(state, context, last.simple.slice(0, 120)),
          grounded: true, sources: [], instruction: last,
        };
      }
      if (step) {
        return {
          message: `${step.simple_description}\nآن را برای شما مشخص کرده‌ام 👇`,
          tone: 'reassuring',
          actions: pointAt(state, context, step.simple_description.slice(0, 120)),
          grounded: true, sources: [],
          instruction: { title: step.title, body: step.description, simple: step.simple_description },
        };
      }
      break;
    }

    case 'OTP_NOT_RECEIVED': {
      const article = findByIntent('OTP_NOT_RECEIVED')!;
      const actions: AssistantAction[] = [];
      if (available.includes('otp_resend')) {
        actions.push({ type: 'scroll_to_element', target: 'otp_resend' });
        actions.push({ type: 'highlight_element', target: 'otp_resend', message: 'ارسال مجدد رمز موقت' });
        actions.push({ type: 'request_operation', operation: 'RESEND_OTP', requires_confirmation: true });
      }
      return { ...articleAnswer(article, false), tone: 'reassuring', actions };
    }

    case 'OTP_INVALID': {
      const article = findByIntent('OTP_INVALID')!;
      const actions: AssistantAction[] = available.includes('otp_input')
        ? [{ type: 'highlight_element', target: 'otp_input', message: 'کادر رمز موقت' }]
        : [];
      return { ...articleAnswer(article, false), tone: 'reassuring', actions };
    }

    case 'LOGIN_PROBLEM': {
      const article = context.error_code ? findByErrorCode(context.error_code) ?? findByIntent('LOGIN_PROBLEM')! : findByIntent('LOGIN_PROBLEM')!;
      const actions: AssistantAction[] = available.includes('login_form')
        ? [{ type: 'highlight_element', target: 'login_form', message: 'فرم ورود' }]
        : [];
      return { ...articleAnswer(article, false), tone: 'reassuring', actions };
    }

    case 'CANNOT_FIND_NOTIFICATION': {
      const article = findByIntent('CANNOT_FIND_NOTIFICATION')!;
      const actions: AssistantAction[] = [];
      if (available.includes('tile_viewed_notifications')) {
        actions.push({ type: 'highlight_element', target: 'tile_viewed_notifications', message: 'ابلاغیه‌های مشاهده شده' });
      } else if (available.includes('notification_list')) {
        actions.push({ type: 'highlight_element', target: 'notification_list', message: 'فهرست ابلاغیه‌ها' });
      }
      return { ...articleAnswer(article, false), tone: 'helpful', actions };
    }

    case 'DOWNLOAD_NOTIFICATION':
    case 'PRINT_NOTIFICATION': {
      const article = findByIntent('DOWNLOAD_NOTIFICATION')!;
      const actions: AssistantAction[] = [];
      if (available.includes('notification_print_button')) {
        actions.push({ type: 'scroll_to_element', target: 'notification_print_button' });
        actions.push({ type: 'highlight_element', target: 'notification_print_button', message: 'نسخه چاپی ابلاغیه' });
      } else if (state.current_step && state.current_step !== 'NOTIFICATION_DETAIL') {
        actions.push({ type: 'show_instruction', title: 'ابتدا ابلاغیه را باز کنید', body: 'برای دریافت یا چاپ، اول باید ابلاغیه موردنظر را از فهرست باز کنید.' });
      }
      return { ...articleAnswer(article, false), tone: 'instructional', actions };
    }

    case 'WHAT_IS_THIS': {
      const hits = search(message, 1);
      const article = hits[0];
      if (article) return { ...articleAnswer(article, false), tone: 'helpful', actions: [] };
      if (step) {
        return {
          message: `شما در مرحله «${step.title}» هستید. ${step.description}`,
          tone: 'helpful',
          actions: pointAt(state, context),
          grounded: true, sources: [],
          instruction: { title: step.title, body: step.description, simple: step.simple_description },
        };
      }
      break;
    }

    case 'PAGE_CONFUSION': {
      if (step) {
        return {
          message: `نگران نباشید. شما در مرحله «${step.title}» هستید. ${step.simple_description}`,
          tone: 'reassuring',
          actions: pointAt(state, context),
          grounded: true, sources: [],
          instruction: { title: step.title, body: step.description, simple: step.simple_description },
        };
      }
      return {
        message: 'بگویید می‌خواهید چه کاری انجام دهید؛ مثلاً «ابلاغیه‌ام را ببینم». آن‌وقت قدم‌به‌قدم همراهتان می‌شوم.',
        tone: 'helpful', actions: [], grounded: true, sources: [], instruction: null,
      };
    }

    case 'HUMAN_SUPPORT': {
      return {
        message:
          'حتماً. می‌توانید با مرکز پشتیبانی سامانه‌های قضایی تماس بگیرید یا به نزدیک‌ترین دفتر خدمات الکترونیک قضایی مراجعه کنید. اگر بخواهید، پیش از آن یک بار دیگر با هم همین مرحله را مرور کنیم.',
        tone: 'helpful',
        actions: [{ type: 'offer_human_support', reason: 'user_requested' }],
        grounded: true, sources: [], instruction: null,
      };
    }

    case 'OUT_OF_SCOPE': {
      return {
        message:
          'این موضوع خارج از کاری است که من می‌توانم انجام دهم. من فقط در کار کردن با همین سامانه راهنمایی‌تان می‌کنم و درباره پرونده یا تصمیم قضایی اظهارنظر نمی‌کنم. برای مسائل حقوقی باید از مشاور حقوقی یا دفاتر خدمات الکترونیک قضایی کمک بگیرید.',
        tone: 'helpful',
        actions: [{ type: 'offer_human_support', reason: 'out_of_scope' }],
        grounded: true, sources: [], instruction: null,
      };
    }

    default:
      break;
  }

  // Fall through: error context first, then lexical retrieval, then a
  // context-aware "what can I do for you" — never a made-up answer.
  if (context.error_code) {
    const article = findByErrorCode(context.error_code);
    if (article) return { ...articleAnswer(article, false), tone: 'reassuring', actions: pointAt(state, context) };
  }
  const hits = search(message, 2);
  if (hits.length > 0 && hits[0]) {
    return { ...articleAnswer(hits[0], false), tone: 'helpful', actions: [] };
  }
  if (step) {
    return {
      message: `متوجه سؤالتان نشدم، اما در مرحله «${step.title}» هستید. ${step.simple_description}`,
      tone: 'helpful',
      actions: pointAt(state, context),
      grounded: true, sources: [],
      instruction: { title: step.title, body: step.description, simple: step.simple_description },
    };
  }
  return {
    message:
      'برای اینکه بهتر کمک کنم، بگویید می‌خواهید چه کاری انجام دهید. مثلاً «ابلاغیه‌ام را ببینم» یا «مشکل ورود دارم».',
    tone: 'helpful', actions: [], grounded: true, sources: [], instruction: null,
  };
}

/** Context-sensitive quick actions (سند §20). */
export function quickActions(state: WorkflowState, context: PageContext): QuickAction[] {
  const list: QuickAction[] = [];
  const push = (id: string, icon: string, label: string, message: string): void => {
    list.push({ id, icon, label, message });
  };

  if (!state.workflow_id) {
    push('qa_guided', '👣', 'قدم‌به‌قدم راهنمایی‌ام کن', 'قدم‌به‌قدم راهنمایی‌ام کن');
    push('qa_view_notification', '📄', 'ابلاغیه‌ام را ببینم', 'ابلاغیه‌ام را می‌خواهم ببینم');
  } else {
    push('qa_next', '➡️', 'مرحله بعد چیست؟', 'بعدش چی؟');
    push('qa_not_understood', '❓', 'متوجه نشدم', 'متوجه نشدم');
  }

  switch (context.page_id) {
    case 'PAGE_LOGIN':
      push('qa_login_problem', '🔐', 'مشکل ورود دارم', 'مشکل ورود دارم');
      break;
    case 'PAGE_OTP':
      push('qa_otp_missing', '📱', 'رمز برایم نیامده', 'رمز برای من ارسال نشده');
      break;
    case 'PAGE_NOTIFICATION_LIST':
      push('qa_cannot_find', '🔎', 'ابلاغیه‌ام را پیدا نمی‌کنم', 'ابلاغیه‌ام را پیدا نمی‌کنم');
      break;
    case 'PAGE_NOTIFICATION_DETAIL':
    case 'PAGE_NOTIFICATION_PRINT':
      push('qa_download', '💾', 'چطور ذخیره یا چاپ کنم؟', 'چطور ابلاغیه را ذخیره یا چاپ کنم؟');
      break;
    default:
      break;
  }

  push('qa_repeat', '🔄', 'مرحله را دوباره توضیح بده', 'دوباره توضیح بده');
  if (state.failure_count >= 2) push('qa_human', '🧑‍💼', 'پشتیبانی انسانی', 'می‌خواهم با پشتیبانی صحبت کنم');
  return list.slice(0, 6);
}
