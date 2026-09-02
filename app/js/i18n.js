/** UI strings. Persian first; English and Arabic matter for foreign visitors. */

export const STRINGS = {
  fa: {
    dir: 'rtl',
    ask: 'سوالتان را بپرسید...',
    send: 'ارسال',
    listen: 'صحبت کنید',
    listening: 'در حال شنیدن...',
    thinking: 'در حال فکر کردن...',
    speaking: 'در حال پاسخ',
    idle: 'آماده',
    tapToStart: 'برای شروع ضربه بزنید',
    greeting: 'سلام! من راهنمای هوشمند این موزه هستم. هرچه دربارهٔ این اثر می‌خواهید بدانید، بپرسید.',
    aboutObject: 'دربارهٔ',
    noVoice: 'صدای فارسی روی این دستگاه نصب نیست؛ پاسخ فقط به‌صورت متن نمایش داده می‌شود.',
    demoMode: 'حالت نمایشی',
    suggestions: ['این اثر چیست؟', 'قدمتش چقدر است؟', 'ساعت کار موزه؟', 'سرویس بهداشتی کجاست؟']
  },
  en: {
    dir: 'ltr',
    ask: 'Ask your question...',
    send: 'Send',
    listen: 'Speak',
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Answering',
    idle: 'Ready',
    tapToStart: 'Tap to start',
    greeting: 'Hello! I am this museum’s AI guide. Ask me anything about this piece.',
    aboutObject: 'About',
    noVoice: 'No voice for this language is installed on your device; answers will be shown as text.',
    demoMode: 'Demo mode',
    suggestions: ['What is this piece?', 'How old is it?', 'Opening hours?', 'Where are the restrooms?']
  },
  ar: {
    dir: 'rtl',
    ask: 'اطرح سؤالك...',
    send: 'إرسال',
    listen: 'تحدث',
    listening: 'أستمع...',
    thinking: 'أفكر...',
    speaking: 'يجيب',
    idle: 'جاهز',
    tapToStart: 'اضغط للبدء',
    greeting: 'مرحباً! أنا المرشد الذكي لهذا المتحف. اسألني أي شيء عن هذه القطعة.',
    aboutObject: 'حول',
    noVoice: 'لا يوجد صوت لهذه اللغة على جهازك؛ ستظهر الإجابات كنص.',
    demoMode: 'وضع العرض',
    suggestions: ['ما هذه القطعة؟', 'كم عمرها؟', 'ساعات العمل؟', 'أين دورات المياه؟']
  }
};

export function t(lang) { return STRINGS[lang] || STRINGS.fa; }
