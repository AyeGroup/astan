/**
 * پیکربندی مرکزی پلتفرم آواتار موزه.
 *
 * هر موزه (tenant) می‌تواند این مقادیر را از طریق پارامترهای URL یا یک
 * فایل کانفیگ سمت سرور بازنویسی کند. ترتیب اولویت:
 *   پارامتر URL  >  window.MUSEUM_CONFIG  >  مقادیر پیش‌فرض زیر
 */

const DEFAULTS = {
  rag: {
    // ---------------------------------------------------------------
    // استریم (SSE) در ragbuilder تأیید شده است، پس 'auto' اول SSE را
    // امتحان می‌کند و پاسخ جمله‌به‌جمله پخش می‌شود.
    //
    // TODO(قرارداد API): نام دقیق مسیر و فیلدها هنوز تأیید نشده و بر
    // اساس ویجت فعلی حدس زده شده است.
    // ---------------------------------------------------------------
    baseUrl: 'https://ragbuilder.aia-ai.com/api/public',
    botUUID: '51585baf-c08c-4e4a-ab21-f1e704831154',
    chatPath: '/chat',
    transport: 'auto',        // auto | sse | json | mock
    // بازگشت بی‌صدا به دادهٔ نمایشی در تولید یعنی آواتار به بازدیدکنندهٔ
    // واقعی پاسخ ساختگی می‌دهد. فقط برای دمو روشن می‌شود.
    mockFallback: false,
    fields: {
      message: 'message',
      bot: 'bot_uuid',
      session: 'session_id',
      context: 'context',
      answer: 'answer'        // مسیر فیلد پاسخ در JSON غیراستریم
    },
    timeoutMs: 20000
  },

  tts: {
    mode: 'auto',             // auto | server | browser | off
    endpoint: '',             // مثال: https://api.example.com/tts  (خروجی: audio/mpeg)
    voice: '',                // نام صدای مرورگر؛ خالی = انتخاب خودکار بر اساس زبان
    rate: 1.0,
    pitch: 1.0,
    cache: true               // کش صوت در IndexedDB
  },

  stt: {
    mode: 'auto',             // auto | browser | server | off
    endpoint: '',             // مثال: https://api.example.com/stt (POST audio → {text})
    maxSeconds: 15
  },

  avatar: {
    id: 'mehrbanoo',
    // موتور رندر لب‌سینک: warp = تغییرشکل ناحیهٔ دهان روی هر تصویر دلخواه
    // (بدون نیاز به اسپرایت و بدون GPU سرور) | sprites = اسپرایت ویزم آماده
    engine: 'warp',
    idleMotion: true
  },

  ui: {
    lang: 'fa',               // fa | en | ar
    autoGreet: true,
    showTranscript: true
  },

  analytics: {
    endpoint: '',             // POST رویدادها؛ خالی = فقط console
    enabled: true
  }
};

/** ادغام عمیق ساده (فقط برای آبجکت‌های ساده) */
function merge(base, override) {
  if (!override) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object'
      ? merge(base[k], v)
      : v;
  }
  return out;
}

/**
 * نگاشت پارامترهای کوتاه URL — این‌ها همان چیزی هستند که داخل QR کنار
 * هر اثر کدگذاری می‌شوند و باید کوتاه بمانند تا QR ساده و سریع اسکن شود.
 *
 *   ?bot=<uuid>&av=<avatarId>&obj=<objectId>&t=<عنوان اثر>&lang=fa
 */
function fromUrl(search) {
  const p = new URLSearchParams(search);
  const o = { rag: {}, avatar: {}, ui: {}, tts: {}, stt: {} };
  if (p.get('bot')) o.rag.botUUID = p.get('bot');
  if (p.get('api')) o.rag.baseUrl = p.get('api');
  if (p.get('mock') === '1') { o.rag.transport = 'mock'; o.rag.mockFallback = true; }
  if (p.get('av')) o.avatar.id = p.get('av');
  if (p.get('lang')) o.ui.lang = p.get('lang');
  if (p.get('tts')) o.tts.mode = p.get('tts');
  return o;
}

/** شناسهٔ اثری که QR آن اسکن شده — به‌عنوان context به RAG تزریق می‌شود. */
export function readObjectContext(search = location.search) {
  const p = new URLSearchParams(search);
  const id = p.get('obj');
  if (!id) return null;
  return { id, title: p.get('t') || id };
}

export const CONFIG = merge(merge(DEFAULTS, window.MUSEUM_CONFIG), fromUrl(location.search));
