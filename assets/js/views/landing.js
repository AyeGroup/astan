/* §7 Landing · §8 Auth · §9–11 Onboarding — all "bare" layout screens. */
import { esc, icon, on, toast } from '../ui.js';
import * as store from '../store.js';
import { go } from '../router.js';
import { INTEREST_SEEDS } from '../data.js';

const brand = `
  <a class="brand" href="#/">
    <span class="brand-mark">پ</span>
    <span class="brand-name">پژوهش</span>
  </a>`;

/* --------------------------------------------------------------- Landing */
export function landing() {
  return {
    layout: 'bare',
    title: 'پژوهش — لازم نیست همه‌چیز را بخوانید',
    html: `
      <div class="plain">
        <nav class="topbar-inner" style="padding-inline:0">
          ${brand}
          <span class="grow"></span>
          <button class="btn btn-ghost btn-icon btn-sm" data-act="theme:toggle" aria-label="روشن یا تاریک">${icon('moon', 16)}</button>
          <button class="btn btn-sm btn-ghost" data-act="nav:auth">ورود</button>
          <button class="btn btn-sm btn-primary" data-act="nav:auth">شروع کنید</button>
        </nav>

        <header class="hero">
          <div class="hero-copy">
            <span class="label">دستیار خواندن شما</span>
            <h1 class="hero-t">لازم نیست همه‌چیز را بخوانید.<br><em>ما می‌گوییم چه چیزی مهم است.</em></h1>
            <p class="lead">سایت‌ها و موضوع‌هایی که برایتان مهم است را اضافه کنید.
              ما هر روز می‌گردیم، می‌خوانیم، و فقط آنچه به کار شما می‌آید را جلو می‌آوریم — با دلیلش.</p>
            <div class="actions">
              <button class="btn btn-primary btn-lg" data-act="nav:auth">رایگان شروع کنید</button>
              <button class="btn btn-lg" data-act="landing:how">چطور کار می‌کند؟</button>
            </div>
            <p class="xs muted-2">بدون کارت بانکی · کمتر از یک دقیقه</p>
          </div>

          <!-- §7: show the real product, not an illustration -->
          <div class="shot" aria-hidden="true">
            <div class="shot-bar">
              <i></i><i></i><i></i>
              <span class="xs muted-2" style="margin-inline-start:auto">خلاصه امروز شما</span>
            </div>
            <div class="shot-body">
              <span class="label">سه‌شنبه صبح</span>
              <p class="h2 mt-3">۳ چیزی که امروز بهتر است بدانید</p>
              <div class="mt-4">
                ${[
                  ['۹۴', 'کار با ابزار در عامل‌ها یکسان شد', 'به ۸ مقاله‌ای که خواندید مربوط است'],
                  ['۹۱', 'اروپا اجرای قانون را شروع کرد', 'از منبعی که دنبال می‌کنید'],
                  ['۸۳', 'پژوهشی با مقاله ذخیره‌شده شما مخالف است', 'در کتابخانه شما نکته مخالف دارد'],
                ].map(([n, title, why]) => `
                  <div class="shot-row">
                    <span class="score"><b>٪${n}</b></span>
                    <div>
                      <p class="strong" style="line-height:1.65">${title}</p>
                      <p class="xs muted mt-2">${why}</p>
                    </div>
                  </div>`).join('')}
              </div>
            </div>
          </div>
        </header>

        <section class="steps-3" id="how">
          ${[
            ['۱', 'منبع اضافه کنید', 'یک لینک مقاله، یک فایل PDF، یا نشانی یک سایت. بقیه‌اش با ما.'],
            ['۲', 'خلاصه بگیرید', 'خلاصه کوتاه، نکته‌های مهم، و ترجمه فارسی. لازم نیست کل مقاله را بخوانید.'],
            ['۳', 'بدانید چرا', 'زیر هر پیشنهاد نوشته‌ایم چرا به شما نشانش دادیم. اشتباه بود؟ بگویید تا درست شود.'],
          ].map(([n, t, d]) => `
            <div class="step-3">
              <span class="n">${n}</span>
              <h3 class="h2">${t}</h3>
              <p class="muted">${d}</p>
            </div>`).join('')}
        </section>

        <section class="cta-band">
          <h2 class="h1">وقت‌تان را صرف خواندن چیزهای مهم کنید</h2>
          <p class="lead" style="max-width:32rem">اگر فقط پنج دقیقه وقت دارید، ما مهم‌ترین چیزها را جلوی چشمتان می‌گذاریم.</p>
          <button class="btn btn-primary btn-lg" data-act="nav:auth">حساب بسازید</button>
        </section>

        <footer class="foot">
          <span class="xs muted-2">پژوهش · دستیار خواندن شما</span>
          <span class="xs muted-2">نمونه آزمایشی — همه محتوا نمونه است</span>
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
      <div class="center-wrap">
        <div class="center-card">
          ${brand}
          <div>
            <h1 class="h1">حساب بسازید</h1>
            <p class="muted mt-2">بعدش موضوع‌هایتان را انتخاب می‌کنید. کمتر از یک دقیقه.</p>
          </div>

          <button class="btn btn-block btn-lg" data-act="auth:google">
            ${icon('globe')} با گوگل وارد شوید
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
              <label for="password">رمز</label>
              <input class="input" id="password" name="password" type="password" placeholder="حداقل ۸ حرف" minlength="8" required>
            </div>
            <button class="btn btn-primary btn-lg btn-block" type="submit">ادامه</button>
          </form>

          <p class="xs muted-2" style="text-align:center">
            نمونه آزمایشی است — حسابی ساخته نمی‌شود و اطلاعاتی جایی نمی‌رود.
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
  title: `راه‌اندازی ${step} از ۳ — پژوهش`,
  html: `
    <div class="onb">
      <header class="onb-head">
        ${brand}
        <div class="row gap-4">
          <span class="xs muted">${['۱', '۲', '۳'][step - 1]} از ۳</span>
          <span class="stepper">${[1, 2, 3].map(i => `<i data-on="${i <= step}"></i>`).join('')}</span>
        </div>
      </header>
      <div class="onb-body fade-in">
        ${body}
        <div class="row between wrap gap-4 mt-7" style="padding-top:var(--s-5);border-top:1px solid var(--line)">
          ${foot}
        </div>
      </div>
    </div>`,
});

export function onboarding(segments) {
  const step = Number(segments[0]) || 1;
  if (step === 2) return step2();
  if (step === 3) return step3();
  return step1();
}

function topicGrid() {
  const q = draft.query.trim().toLowerCase();
  const pool = [...new Set([...INTEREST_SEEDS, ...draft.interests])];
  const list = q ? pool.filter(t => t.toLowerCase().includes(q)) : pool;
  const canCreate = q && !pool.some(t => t.toLowerCase() === q);

  return `
    ${list.map(t => `
      <button class="pill" data-act="onb:toggle" data-id="${esc(t)}"
        aria-pressed="${draft.interests.includes(t)}">
        <span>${esc(t)}</span>
        ${draft.interests.includes(t) ? icon('check', 14) : ''}
      </button>`).join('')}
    ${canCreate ? `
      <button class="pill" data-act="onb:create" style="border-style:dashed">
        <span>${icon('plus', 14)} «${esc(draft.query)}» را اضافه کن</span>
      </button>` : ''}
    ${!list.length && !canCreate ? '<p class="muted small">چیزی پیدا نشد.</p>' : ''}`;
}

function step1() {
  return shell(1, `
    <span class="label">قدم اول</span>
    <h1 class="h1 mt-3">دوست دارید درباره چه چیزهایی بدانید؟</h1>
    <p class="muted mt-3">دو تا سه مورد انتخاب کنید. هر وقت خواستید عوضشان کنید.</p>

    <div class="field mt-6">
      <input class="input input-lg" id="topicSearch" placeholder="یا خودتان بنویسید…"
        value="${esc(draft.query)}" data-act-enter="onb:create" autocomplete="off">
    </div>

    <div class="pill-grid mt-4" id="topicGrid">${topicGrid()}</div>
  `, `
    <span class="small muted" data-topic-count>${draft.interests.length} تا انتخاب شد</span>
    <button class="btn btn-primary btn-lg" data-act="onb:next" data-step="2"
      ${draft.interests.length < 1 ? 'disabled' : ''}>ادامه</button>
  `);
}

function step2() {
  return shell(2, `
    <span class="label">قدم دوم</span>
    <h1 class="h1 mt-3">اولین منبعتان را اضافه کنید</h1>
    <p class="muted mt-3">یکی کافی است. تا شما بقیه را تنظیم کنید، ما کارش را شروع می‌کنیم.</p>

    <div class="grid grid-3 mt-6">
      ${[
        ['article', 'link', 'یک مقاله', 'لینکش را بچسبانید'],
        ['website', 'globe', 'یک سایت', 'هر روز برایتان چکش می‌کنیم'],
        ['pdf', 'file', 'یک فایل PDF', 'از کامپیوترتان بفرستید'],
      ].map(([kind, ic, name, hint]) => `
        <button class="choice" data-act="onb:add" data-kind="${kind}">
          <span class="ico">${icon(ic, 20)}</span>
          <b>${name}</b>
          <span class="small muted">${hint}</span>
        </button>`).join('')}
    </div>

    <p class="xs muted-2 mt-5">اگر رد کنید هم اشکالی ندارد — بر اساس موضوع‌هایی که انتخاب کردید چند پیشنهاد آماده می‌کنیم.</p>
  `, `
    <button class="btn btn-ghost" data-act="onb:next" data-step="3">بعداً</button>
    <button class="btn btn-primary btn-lg" data-act="onb:next" data-step="3">ادامه</button>
  `);
}

const INTENTS = [
  { id: 'updated',  label: 'فقط خبرها را بدانم',        hint: 'هر روز یک خلاصه کوتاه.' },
  { id: 'deep',     label: 'عمیق دنبال کنم',            hint: 'مقاله کمتر، تحلیل و سیر زمانی بیشتر.' },
  { id: 'industry', label: 'یک صنعت را دنبال کنم',      hint: 'خبر شرکت‌ها، سرمایه‌گذاری و قوانین.' },
  { id: 'learn',    label: 'یک موضوع را یاد بگیرم',     hint: 'اول مطالب پایه، بعد خبرهای تازه.' },
  { id: 'track',    label: 'چند سایت خاص را بپایم',     hint: 'هر تغییری در آن‌ها را به شما می‌گوییم.' },
];

function step3() {
  return shell(3, `
    <span class="label">قدم سوم</span>
    <h1 class="h1 mt-3">بیشتر برای چه کاری می‌خواهیدش؟</h1>
    <p class="muted mt-3">یکی را انتخاب کنید. بعداً هم می‌شود عوضش کرد.</p>

    <div class="col gap-3 mt-6">
      ${INTENTS.map(i => `
        <button class="pick" data-act="onb:intent" data-id="${i.id}"
          data-selected="${draft.intent === i.id}">
          <span class="pick-mark">${draft.intent === i.id ? icon('check', 12) : ''}</span>
          <span>
            <b>${esc(i.label)}</b>
            <span class="small muted mt-1" style="display:block">${esc(i.hint)}</span>
          </span>
        </button>`).join('')}
    </div>
  `, `
    <button class="btn btn-ghost" data-act="onb:finish">رد کن</button>
    <button class="btn btn-primary btn-lg" data-act="onb:finish" ${draft.intent ? '' : 'disabled'}>
      تمام، شروع کنیم
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
    if (count) count.textContent = `${draft.interests.length} تا انتخاب شد`;
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
    toast(`«${value}» اضافه شد`);
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
    toast('آماده است — خوش آمدید');
  });
}

export const onboardingDraft = () => draft;
