/* §7 Landing · §8 Auth · §9–11 Onboarding — all "bare" layout screens. */
import { esc, icon, on, toast } from '../ui.js';
import * as store from '../store.js';
import { go } from '../router.js';
import { INTEREST_SEEDS } from '../data.js';

const brand = `
  <a class="brand" href="#/" style="padding:0">
    <span class="brand-mark">پ</span>
    <span class="brand-name">پژوهش</span>
  </a>`;

/* --------------------------------------------------------------- Landing */
export function landing() {
  return {
    layout: 'bare',
    title: 'پژوهش — آنچه مهم است را بدانید',
    html: `
      <div class="landing">
        <nav class="landing-nav">
          ${brand}
          <div class="actions-inline">
            <button class="btn btn-ghost btn-icon" data-act="theme:toggle" aria-label="تغییر پوسته">${icon('moon')}</button>
            <button class="btn btn-ghost" data-act="nav:auth">ورود</button>
            <button class="btn btn-primary" data-act="nav:auth">شروع پژوهش</button>
          </div>
        </nav>

        <header class="hero">
          <div class="hero-copy">
            <span class="eyebrow">هوشمندی پژوهش شخصی</span>
            <h1 class="display">آنچه مهم است را بدانید.<br>بدون اینکه همه‌چیز را بخوانید.</h1>
            <p class="lead">سایت‌ها، مقاله‌ها و موضوع‌هایی را که برایتان مهم‌اند وصل کنید.
              هوش مصنوعی آنچه را برای شما مهم است پیدا می‌کند، می‌فهمد و پیشنهاد می‌دهد.</p>
            <div class="actions-inline mt-2">
              <button class="btn btn-primary btn-lg" data-act="nav:auth">شروع پژوهش</button>
              <button class="btn btn-lg" data-act="landing:how">ببینید چطور کار می‌کند</button>
            </div>
            <p class="xs muted-2">بدون کارت بانکی. نخستین بینش شما در کمتر از یک دقیقه.</p>
          </div>

          <!-- §7 Hero visual: the real product surface, not decoration -->
          <div class="preview" aria-hidden="true">
            <div class="preview-bar">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              <span class="xs muted-2" style="margin-inline-start:auto">هوشمندی پژوهش شما</span>
            </div>
            <div class="preview-body">
              <div>
                <span class="eyebrow">سه‌شنبه</span>
                <p class="h2 serif mt-2">سه چیزی که امروز باید بدانید</p>
              </div>
              <div>
                <div class="preview-row">
                  <span class="preview-score">٪۹۴</span>
                  <div>
                    <p style="font-family:var(--font-serif)">ابزار عامل‌ها سریع‌تر از پیش‌بینی استاندارد شد</p>
                    <p class="xs muted mt-2">عامل‌های هوش مصنوعی · مرتبط با ۸ مقاله‌ای که خواندید</p>
                  </div>
                </div>
                <div class="preview-row">
                  <span class="preview-score">٪۹۱</span>
                  <div>
                    <p style="font-family:var(--font-serif)">اجرای قانون هوش مصنوعی با کاغذبازی آغاز شد</p>
                    <p class="xs muted mt-2">مقررات هوش مصنوعی · از منبعی که پایش می‌کنید</p>
                  </div>
                </div>
                <div class="preview-row">
                  <span class="preview-score">٪۸۳</span>
                  <div>
                    <p style="font-family:var(--font-serif)">پژوهشی ادعایی که ذخیره کردید را مقید می‌کند</p>
                    <p class="xs muted mt-2">داده مصنوعی · با کتابخانه شما در تضاد است</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section class="feature-grid" id="how">
          <div class="feature">
            <span class="num">۰۱</span>
            <h3 class="h2">یک منبع اضافه کنید</h3>
            <p class="muted">یک مقاله، یک PDF، یا یک سایت کامل. ساختارش را نقشه‌برداری می‌کنیم،
              مقاله‌های هم‌خوان با موضوع‌های شما را پیدا می‌کنیم و بقیه را نادیده می‌گیریم.</p>
          </div>
          <div class="feature">
            <span class="num">۰۲</span>
            <h3 class="h2">درک به دست بیاورید</h3>
            <p class="muted">خلاصه، نکته‌های کلیدی، ترجمه و — بخشی که واقعاً مهم است —
              اینکه نسبت به آنچه می‌دانید چه چیزی تغییر کرده.</p>
          </div>
          <div class="feature">
            <span class="num">۰۳</span>
            <h3 class="h2">بدانید چرا</h3>
            <p class="muted">هر پیشنهاد دلیل خودش را می‌گوید و به منبعش پیوند می‌دهد.
              وقتی منابع مطمئن نیستند، ما هم نیستیم.</p>
          </div>
        </section>

        <section class="card" style="padding:var(--s-7)">
          <div class="row between wrap gap-5">
            <div style="max-width:44ch">
              <span class="eyebrow">قول ما</span>
              <p class="h1 serif mt-3">همه‌چیز را نخوانید.<br>آنچه مهم است را بدانید.</p>
            </div>
            <button class="btn btn-accent btn-lg" data-act="nav:auth">ساخت حساب کاربری</button>
          </div>
        </section>

        <footer class="landing-foot">
          <span class="xs muted-2">پژوهش · سکوی هوشمندی پژوهش شخصی</span>
          <span class="xs muted-2">نمونه اولیه — همه محتوا داده نمونه است</span>
        </footer>
      </div>`,
  };
}

/* ------------------------------------------------------------------ Auth */
export function auth() {
  return {
    layout: 'bare',
    title: 'ورود — پژوهش',
    html: `
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="col gap-2" style="align-items:flex-start">
            ${brand}
            <h1 class="h1 mt-4">ساخت حساب کاربری</h1>
            <p class="muted small">در گام بعد موضوع‌هایتان را انتخاب می‌کنید، تا هرگز به داشبورد خالی نرسید.</p>
          </div>

          <button class="btn btn-block btn-lg" data-act="auth:google">
            ${icon('globe')} ادامه با گوگل
          </button>

          <div class="row gap-4">
            <span class="divider grow"></span>
            <span class="xs muted-2">یا</span>
            <span class="divider grow"></span>
          </div>

          <form class="col gap-4" data-act="auth:submit">
            <div class="field">
              <label for="email">ایمیل</label>
              <input class="input" id="email" name="email" type="email" placeholder="you@example.com" dir="ltr" required>
            </div>
            <div class="field">
              <label for="password">گذرواژه</label>
              <input class="input" id="password" name="password" type="password" placeholder="دست‌کم ۸ نویسه" minlength="8" required>
            </div>
            <button class="btn btn-primary btn-lg btn-block" type="submit">ادامه</button>
          </form>

          <p class="xs muted-2" style="text-align:center">
            نمونه اولیه — حسابی ساخته نمی‌شود و چیزی از مرورگر شما بیرون نمی‌رود.
          </p>
        </div>
      </div>`,
  };
}

/* ------------------------------------------------------------ Onboarding */
const CUSTOM_KEY = '__custom__';
let draft = { interests: [], intent: null, query: '' };

const shell = (step, body, foot) => ({
  layout: 'bare',
  title: `راه‌اندازی، گام ${step} از ۳ — پژوهش`,
  html: `
    <div class="onboard-wrap">
      <header class="onboard-head">
        ${brand}
        <div class="row gap-4">
          <span class="xs muted">گام ${step} از ۳</span>
          <span class="stepper">
            ${[1, 2, 3].map(i => `<i data-on="${i <= step}"></i>`).join('')}
          </span>
        </div>
      </header>
      <div class="onboard-body fade-in">
        ${body}
        <div class="row between wrap gap-4 mt-6" style="padding-top:var(--s-5);border-top:1px solid var(--line)">
          ${foot}
        </div>
      </div>
    </div>`,
});

export function onboarding(segments) {
  const step = Number(segments[0]) || 1;
  if (step === 2) return onboardStep2();
  if (step === 3) return onboardStep3();
  return onboardStep1();
}

function topicGrid() {
  const q = draft.query.trim().toLowerCase();
  const pool = [...new Set([...INTEREST_SEEDS, ...draft.interests])];
  const list = q ? pool.filter(t => t.toLowerCase().includes(q)) : pool;
  const canCreate = q && !pool.some(t => t.toLowerCase() === q);

  return `
    ${list.map(t => `
      <button class="topic-pill" data-act="onb:toggle" data-id="${esc(t)}"
        aria-pressed="${draft.interests.includes(t)}">
        <span>${esc(t)}</span>
        ${draft.interests.includes(t) ? icon('check', 14) : ''}
      </button>`).join('')}
    ${canCreate ? `
      <button class="topic-pill" data-act="onb:create" style="border-style:dashed">
        <span>${icon('plus', 14)} ساختن «${esc(draft.query)}»</span>
      </button>` : ''}
    ${!list.length && !canCreate ? '<p class="muted small">موضوعی با این جست‌وجو پیدا نشد.</p>' : ''}`;
}

function onboardStep1() {
  return shell(1, `
    <h1 class="h1">دوست دارید درباره چه چیزی بیشتر بدانید؟</h1>
    <p class="lead mt-3">دست‌کم دو مورد انتخاب کنید. هر زمان می‌توانید تغییرشان دهید و
      پیشنهادها همزمان با مطالعه شما تنظیم می‌شوند.</p>

    <div class="field mt-6">
      <input class="input input-lg" id="topicSearch" placeholder="جست‌وجوی موضوع…"
        value="${esc(draft.query)}" data-act-enter="onb:create" autocomplete="off">
    </div>

    <div class="topic-grid mt-4" id="topicGrid">${topicGrid()}</div>
  `, `
    <span class="small muted" data-topic-count>${draft.interests.length} مورد انتخاب شد</span>
    <button class="btn btn-primary btn-lg" data-act="onb:next" data-step="2"
      ${draft.interests.length < 1 ? 'disabled' : ''}>ادامه</button>
  `);
}

function onboardStep2() {
  return shell(2, `
    <h1 class="h1">نخستین منبعتان را اضافه کنید</h1>
    <p class="lead mt-3">یک منبع برای شروع کافی است. تا شما راه‌اندازی را تمام کنید، پردازشش می‌کنیم.</p>

    <div class="grid grid-3 mt-6">
      <button class="source-choice" data-act="onb:add" data-kind="article">
        ${icon('file', 20)}
        <b>مقاله</b>
        <span class="small muted">نشانی یک مقاله را بچسبانید</span>
      </button>
      <button class="source-choice" data-act="onb:add" data-kind="website">
        ${icon('globe', 20)}
        <b>سایت</b>
        <span class="small muted">پایش یک سایت را به هوش مصنوعی بسپارید</span>
      </button>
      <button class="source-choice" data-act="onb:add" data-kind="pdf">
        ${icon('file', 20)}
        <b>PDF</b>
        <span class="small muted">یک سند بارگذاری کنید</span>
      </button>
    </div>

    <p class="xs muted-2 mt-5">اگر رد کنید، باز هم از منابع عمومیِ هم‌خوان با موضوع‌های انتخابی شما
      یک فید اولیه می‌سازیم.</p>
  `, `
    <button class="btn btn-ghost" data-act="onb:next" data-step="3">بعداً انجام می‌دهم</button>
    <button class="btn btn-primary btn-lg" data-act="onb:next" data-step="3">ادامه</button>
  `);
}

const INTENTS = [
  { id: 'updated',  label: 'به‌روز ماندن',            hint: 'خلاصه کوتاه روزانه از آنچه تغییر کرده.' },
  { id: 'deep',     label: 'پژوهش عمیق',              hint: 'موارد کمتر، ترکیب و خط زمانی بیشتر.' },
  { id: 'industry', label: 'دنبال‌کردن یک صنعت',       hint: 'وزن بیشتر روی شرکت‌ها، سرمایه‌گذاری و سیاست‌گذاری.' },
  { id: 'learn',    label: 'یادگیری یک موضوع',         hint: 'اول مطالب پایه، بعد کارهای تازه.' },
  { id: 'track',    label: 'پایش سایت‌های مشخص',       hint: 'پایش و تشخیص تغییر در صدر فید.' },
];

function onboardStep3() {
  return shell(3, `
    <h1 class="h1">می‌خواهید چطور از پژوهش استفاده کنید؟</h1>
    <p class="lead mt-3">این شکل فید شما را تعیین می‌کند. نقطه شروع است، نه قفل همیشگی.</p>

    <div class="col gap-2 mt-6">
      ${INTENTS.map(i => `
        <button class="radio-card" data-act="onb:intent" data-id="${i.id}"
          data-selected="${draft.intent === i.id}">
          <span class="step-mark" style="margin-top:2px">${draft.intent === i.id ? icon('check', 10) : ''}</span>
          <span>
            <b>${esc(i.label)}</b>
            <span class="small muted" style="display:block">${esc(i.hint)}</span>
          </span>
        </button>`).join('')}
    </div>
  `, `
    <button class="btn btn-ghost" data-act="onb:finish">رد کردن</button>
    <button class="btn btn-primary btn-lg" data-act="onb:finish" ${draft.intent ? '' : 'disabled'}>
      فیدم را بساز
    </button>
  `);
}

/* ---------------------------------------------------------------- Actions */
export function registerLandingActions(rerender) {
  on('nav:auth', () => go('/auth'));
  on('landing:how', () => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

  const signIn = (name, email) => {
    store.set({ account: { name, email } });
    draft = { interests: [], intent: null, query: '' };
    go('/onboarding/1');
  };

  on('auth:google', () => signIn('Sara', 'sara@example.com'));
  on('auth:submit', (_d, form) => {
    const email = form.querySelector('#email').value.trim();
    const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    signIn(name || 'Researcher', email);
  });

  /* Live filtering: repaint only the grid so the caret and focus survive. */
  const paintGrid = () => {
    const grid = document.getElementById('topicGrid');
    if (grid) grid.innerHTML = topicGrid();
    const count = document.querySelector('[data-topic-count]');
    if (count) count.textContent = `${draft.interests.length} مورد انتخاب شد`;
    const next = document.querySelector('[data-act="onb:next"][data-step="2"]');
    if (next) next.toggleAttribute('disabled', draft.interests.length < 1);
  };

  document.addEventListener('input', e => {
    if (e.target.id !== 'topicSearch') return;
    draft.query = e.target.value;
    paintGrid();
  });

  on('onb:toggle', ({ id }) => {
    draft.interests = draft.interests.includes(id)
      ? draft.interests.filter(x => x !== id)
      : [...draft.interests, id];
    paintGrid();
  });

  on('onb:create', () => {
    const input = document.getElementById('topicSearch');
    const value = (input?.value || '').trim();
    if (!value) return;
    if (!draft.interests.includes(value)) draft.interests.push(value);
    draft.query = '';
    if (input) input.value = '';
    paintGrid();
    toast(`«${value}» به موضوع‌های شما اضافه شد`);
  });

  on('onb:next', ({ step }) => {
    draft.query = document.getElementById('topicSearch')?.value ?? '';
    go(`/onboarding/${step}`);
  });

  on('onb:intent', ({ id }) => { draft.intent = id; rerender(); });

  on('onb:add', ({ kind }) => {
    store.set({ interests: draft.interests });
    window.dispatchEvent(new CustomEvent('add:open', { detail: { kind, from: 'onboarding' } }));
  });

  on('onb:finish', () => {
    store.set({
      interests: draft.interests.length ? draft.interests : ['هوش مصنوعی', 'فناوری'],
      intent: draft.intent,
      onboarded: true,
    });
    draft.interests.forEach(label => store.signal('followTopic', { label }));
    go('/home');
    toast('فید شما آماده است');
  });
}

export const onboardingDraft = () => draft;
