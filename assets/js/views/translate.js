/* ==========================================================================
   مترجم — a standalone workspace: give it an article, get back the Persian
   translation, a summary, and the key points listed one by one.
   ========================================================================== */
import { esc, icon, on, toast, num, fmtDate, runSteps } from '../ui.js';
import { topicName, sourceName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, emptyState, tabBar } from './components.js';

const state = {
  stage: 'pick',      // pick · working · done
  input: 'library',   // library · text · url
  out: 'fa',          // fa · summary · points
  mode: 'full',       // full · side  (translation layout)
  draft: '',          // pasted text, kept across re-renders
  result: null,
};

const STEPS = [
  { label: 'خواندن متن' },
  { label: 'جدا کردن پاراگراف‌ها' },
  { label: 'ترجمه به فارسی' },
  { label: 'نوشتن خلاصه' },
  { label: 'بیرون کشیدن نکته‌های مهم' },
];

/* --- Plain-text analysis. Real work, done locally. --------------------- */
export function analyze(text) {
  const paras = text.split(/\n{2,}|\r\n\r\n/).map(p => p.trim()).filter(Boolean);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const persian = (text.match(/[؀-ۿ]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return {
    paras,
    words,
    minutes: Math.max(1, Math.round(words / 200)),
    lang: persian > latin ? 'fa' : 'en',
  };
}

/* ========================================================================== */
export function translate() {
  return {
    layout: 'app',
    title: 'مترجم — پژوهش',
    html: `
      <div class="page fade-in">
        <header class="page-head">
          <span class="label">مترجم</span>
          <h1 class="h1">مقاله را بدهید، فارسی‌اش را بگیرید</h1>
          <p class="muted">هر مقاله‌ای را که دارید اینجا بگذارید. ترجمه فارسی، خلاصه کوتاه،
            و نکته‌های مهمش را جدا از هم به شما می‌دهیم.</p>
        </header>

        ${state.stage === 'done' ? resultView() : inputView()}
      </div>`,
  };
}

/* --- Stage 1: pick what to translate ----------------------------------- */
function inputView() {
  const mine = store.allArticles().filter(a => (a.original || []).length);

  return `
    ${tabBar([
      { id: 'library', label: 'از مقاله‌های خودم' },
      { id: 'text',    label: 'متن را می‌چسبانم' },
      { id: 'url',     label: 'لینک مقاله' },
    ], state.input, 'tr:input')}

    ${state.stage === 'working' ? `
      <div class="card">
        <span class="label">در حال کار</span>
        <div id="trSteps" class="mt-4"></div>
      </div>`
    : state.input === 'library' ? `
      <p class="small muted" style="margin-bottom:var(--s-4)">
        یکی از مقاله‌هایتان را انتخاب کنید تا ترجمه‌اش را ببینید.
      </p>
      ${mine.length ? `
        <div class="rows">
          ${mine.map(a => `
            <div class="list-row" data-act="tr:pick" data-id="${a.id}">
              <div class="grow">
                <div class="row gap-2 wrap">
                  <span class="tag tag-red">${esc(topicName(a.topic))}</span>
                  <span class="tag tag-line latin">${esc(sourceName(a.source))}</span>
                </div>
                <h3 class="mt-3">${esc(a.title)}</h3>
                <p class="xs muted-2 mt-2 latin">${esc(a.titleOriginal || '')}</p>
              </div>
              <div class="col gap-2" style="align-items:flex-end;flex:none">
                <span class="meta">${num(a.minutes)} دقیقه</span>
                <span class="btn btn-sm">ترجمه کن</span>
              </div>
            </div>`).join('')}
        </div>`
        : emptyState({
            title: 'هنوز مقاله‌ای ندارید',
            body: 'اول یک مقاله اضافه کنید، بعد می‌توانید همین‌جا ترجمه‌اش را بگیرید.',
            cta: 'یک مقاله اضافه کنید', act: 'add:open', arg: 'article', iconName: 'file',
          })}`
    : state.input === 'text' ? `
      <div class="field">
        <label for="trText">متن مقاله</label>
        <textarea class="textarea" id="trText" rows="10"
          placeholder="متن مقاله را اینجا بچسبانید…"
          style="min-height:220px">${esc(state.draft)}</textarea>
        <p class="xs muted-2">پاراگراف‌ها را با یک خط خالی از هم جدا کنید تا بهتر تفکیک شوند.</p>
      </div>
      <div class="actions mt-5">
        <button class="btn btn-primary btn-lg" data-act="tr:run-text">
          ${icon('spark', 15)} ترجمه کن
        </button>
        <button class="btn btn-lg" data-act="tr:sample">یک نمونه بگذار</button>
      </div>`
    : `
      <div class="field">
        <label for="trUrl">لینک مقاله</label>
        <input class="input input-lg latin" id="trUrl" placeholder="https://example.com/article"
          data-act-enter="tr:run-url" autocomplete="off">
        <p class="xs muted-2">این نمونه آزمایشی است و هر لینکی را قبول می‌کند.</p>
      </div>
      <div class="actions mt-5">
        <button class="btn btn-primary btn-lg" data-act="tr:run-url">
          ${icon('spark', 15)} بگیر و ترجمه کن
        </button>
      </div>`}`;
}

/* --- Stage 3: the three outputs, side by side in tabs ------------------ */
function resultView() {
  const r = state.result;
  return `
    <div class="card" style="margin-bottom:var(--s-6)">
      <div class="row between wrap gap-4">
        <div class="grow" style="min-width:240px">
          <h2 class="h2">${esc(r.title)}</h2>
          ${r.titleOriginal ? `<p class="xs muted-2 mt-2 latin">${esc(r.titleOriginal)}</p>` : ''}
          <div class="meta mt-3">
            ${r.source ? `<span class="latin">${esc(r.source)}</span><span class="sep">·</span>` : ''}
            <span>${num(r.words)} کلمه</span><span class="sep">·</span>
            <span>${num(r.minutes)} دقیقه خواندن</span><span class="sep">·</span>
            <span>${num(r.paras.length)} پاراگراف</span>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-sm" data-act="tr:copy" data-what="${state.out}">
            ${icon('file', 14)} کپی این بخش
          </button>
          <button class="btn btn-sm btn-ghost" data-act="tr:reset">ترجمه تازه</button>
        </div>
      </div>
    </div>

    ${tabBar([
      { id: 'fa',      label: 'ترجمه فارسی' },
      { id: 'summary', label: 'خلاصه' },
      { id: 'points',  label: 'نکته‌های مهم', count: r.points.length || undefined },
    ], state.out, 'tr:out')}

    ${state.out === 'fa' ? faPane(r) : state.out === 'summary' ? summaryPane(r) : pointsPane(r)}`;
}

function faPane(r) {
  if (!r.fa.length) {
    return `
      <div class="state">
        <span class="state-ico">${icon('globe', 22)}</span>
        <h3 class="h2">این متن آماده ترجمه است</h3>
        <p class="muted" style="max-width:46ch">متن شما را به ${num(r.paras.length)} پاراگراف
          تقسیم کردیم. در نسخه واقعی، ترجمه فارسی هر پاراگراف همین‌جا کنار متن اصلی می‌آید.
          این نمونه آزمایشی به سرویس ترجمه وصل نیست و متنی از خودش نمی‌سازد.</p>
        <div class="mt-5" style="width:100%">
          <span class="label">متنی که دریافت کردیم</span>
          <div class="prose mt-3" dir="${r.lang === 'fa' ? 'rtl' : 'ltr'}"
            style="font-size:var(--t-body);max-height:320px;overflow:auto">
            ${r.paras.map(p => `<p>${esc(p)}</p>`).join('')}
          </div>
        </div>
      </div>`;
  }

  if (state.mode === 'side') {
    const rows = Math.max(r.fa.length, r.original.length);
    let out = '';
    for (let i = 0; i < rows; i += 1) {
      out += `
        <div class="tr-pair">
          <div class="prose">${r.fa[i] ? block(r.fa[i]) : ''}</div>
          <div class="prose tr-src" dir="ltr" lang="en">${r.original[i] ? block(r.original[i]) : ''}</div>
        </div>`;
    }
    return `${modeSwitch()}<div class="mt-5">${out}</div>`;
  }

  return `${modeSwitch()}<div class="prose mt-5">${r.fa.map(block).join('')}</div>`;
}

const modeSwitch = () => `
  <div class="row between wrap gap-3">
    <div class="seg" role="group" aria-label="نحوه نمایش">
      <button data-act="tr:mode" data-id="full" aria-pressed="${state.mode === 'full'}">فقط فارسی</button>
      <button data-act="tr:mode" data-id="side" aria-pressed="${state.mode === 'side'}">فارسی و اصلی</button>
    </div>
    <span class="xs muted-2">اصطلاح‌های زیرخط‌دار را نگه دارید تا معنی‌شان را ببینید.</span>
  </div>`;

const block = p =>
  p.startsWith('## ') ? `<h2>${esc(p.slice(3))}</h2>`
  : p.startsWith('> ') ? `<blockquote>${esc(p.slice(2))}</blockquote>`
  : `<p>${p.includes('<span class="term"') ? p : esc(p)}</p>`;

function summaryPane(r) {
  if (!r.summary) {
    return `
      <div class="state">
        <span class="state-ico">${icon('file', 22)}</span>
        <h3 class="h2">خلاصه‌ای نداریم</h3>
        <p class="muted" style="max-width:46ch">برای نوشتن خلاصه باید متن را بخوانیم،
          و این نمونه آزمایشی به سرویس وصل نیست. اگر یکی از مقاله‌های خودتان را انتخاب کنید،
          خلاصه‌اش را می‌بینید.</p>
        <button class="btn btn-primary" data-act="tr:reset">انتخاب از مقاله‌هایم</button>
      </div>`;
  }
  return `
    <div class="block block-red">
      <span class="label">خلاصه در سه خط</span>
      <p class="big">${esc(r.summary)}</p>
    </div>
    ${r.why ? `
      <div class="block">
        <span class="label">این مقاله در یک جمله</span>
        <p>${esc(r.why)}</p>
      </div>` : ''}`;
}

/* «نکات مهمش رو به تفکیک ببینه» — one point per row, each copyable. */
function pointsPane(r) {
  if (!r.points.length) {
    return `
      <div class="state">
        <span class="state-ico">${icon('spark', 22)}</span>
        <h3 class="h2">نکته‌ای بیرون نکشیدیم</h3>
        <p class="muted" style="max-width:46ch">نکته‌های مهم را از متن مقاله بیرون می‌کشیم.
          یکی از مقاله‌های خودتان را انتخاب کنید تا ببینیدشان.</p>
        <button class="btn btn-primary" data-act="tr:reset">انتخاب از مقاله‌هایم</button>
      </div>`;
  }
  return `
    <p class="small muted" style="margin-bottom:var(--s-4)">
      ${num(r.points.length)} نکته از متن این مقاله بیرون کشیده شده. هر کدام را جدا می‌توانید کپی کنید.
    </p>
    <div class="tr-points">
      ${r.points.map((pt, i) => `
        <article class="tr-point">
          <span class="tr-point-n">${num(i + 1)}</span>
          <div class="grow">
            <h3 class="h3">${esc(pt.h)}</h3>
            <p class="small muted mt-2">${esc(pt.p)}</p>
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" data-act="tr:copy-point" data-i="${i}"
            title="کپی این نکته" aria-label="کپی این نکته">${icon('file', 14)}</button>
        </article>`).join('')}
    </div>

    ${r.terms.length ? `
      <section class="section mt-7">
        ${sectionHead('اصطلاح‌ها', '', 'کلمه‌های تخصصی که در متن آمده')}
        <div class="rows">
          ${r.terms.map(t => `
            <div class="kv" style="padding-inline:var(--s-2)">
              <span class="latin strong">${esc(t.en)}</span>
              <span class="small muted">${esc(t.fa)}</span>
            </div>`).join('')}
        </div>
      </section>` : ''}`;
}

/* --- Building a result -------------------------------------------------- */
function fromArticle(a) {
  const terms = [];
  (a.body || []).forEach(p => {
    const re = /<span class="term" data-fa="([^"]+)">([^<]+)<\/span>/g;
    let m;
    while ((m = re.exec(p))) terms.push({ fa: m[1], en: m[2] });
  });
  const plain = (a.body || []).join(' ').replace(/<[^>]+>/g, '');
  const words = plain.trim().split(/\s+/).filter(Boolean).length;

  return {
    id: a.id,
    title: a.title,
    titleOriginal: a.titleOriginal,
    source: sourceName(a.source),
    fa: a.body || [],
    original: a.original || [],
    paras: a.body || [],
    summary: a.tldr,
    why: a.summary,
    points: a.insights || [],
    terms,
    words,
    minutes: a.minutes,
    lang: 'fa',
  };
}

function fromText(text, { title, source } = {}) {
  const meta = analyze(text);
  return {
    id: null,
    title: title || 'متن شما',
    titleOriginal: '',
    source: source || '',
    fa: [],                 // nothing is invented for text we cannot translate
    original: meta.paras,
    paras: meta.paras,
    summary: '',
    why: '',
    points: [],
    terms: [],
    words: meta.words,
    minutes: meta.minutes,
    lang: meta.lang,
  };
}

const SAMPLE = `For most of the past two years, connecting a model to an external tool meant picking a framework and accepting its dialect.

A function description written for one runtime had to be rewritten to run anywhere else. That cost was tolerable when agents were demos. It stopped being tolerable when they became procurement line items.

The change is unglamorous: a shared schema for describing a tool, its parameters, and the shape of what it returns.`;

/* --- Actions ------------------------------------------------------------ */
export function registerTranslateActions(rerender) {
  const keepDraft = () => {
    const el = document.getElementById('trText');
    if (el) state.draft = el.value;
  };

  const work = (build, ms = 520) => {
    state.stage = 'working';
    rerender();
    const host = document.getElementById('trSteps');
    if (!host) return;
    runSteps(host, STEPS, {
      stepMs: ms,
      onDone: () => {
        state.result = build();
        state.stage = 'done';
        state.out = 'fa';
        rerender();
      },
    });
  };

  on('tr:input', ({ id }) => { keepDraft(); state.input = id; rerender(); });
  on('tr:out', ({ id }) => { state.out = id; rerender(); });
  on('tr:mode', ({ id }) => { state.mode = id; rerender(); });

  on('tr:pick', ({ id }) => {
    const a = store.findArticle(id);
    if (!a) return;
    store.signal('translate', { topicId: a.topic, sourceId: a.source, label: a.title });
    work(() => fromArticle(a));
  });

  on('tr:sample', () => { state.draft = SAMPLE; rerender(); });

  on('tr:run-text', () => {
    keepDraft();
    const text = state.draft.trim();
    if (!text) { toast('اول متن مقاله را بچسبانید', 'x'); return; }
    store.signal('translate', { label: 'متن دستی' });
    work(() => fromText(text));
  });

  on('tr:run-url', () => {
    const raw = (document.getElementById('trUrl')?.value || '').trim();
    if (!raw) { toast('اول لینک مقاله را وارد کنید', 'x'); return; }
    let host = raw;
    try { host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname; } catch { /* keep raw */ }
    store.signal('translate', { label: raw });
    work(() => fromText(
      `این نمونه آزمایشی به اینترنت وصل نیست، پس متن این صفحه گرفته نشد.\n\nدر نسخه واقعی، متن مقاله از ${host} خوانده می‌شود و ترجمه‌اش همین‌جا می‌آید.`,
      { title: 'مقاله‌ای از ' + host, source: host },
    ));
  });

  on('tr:reset', () => {
    state.stage = 'pick';
    state.input = 'library';
    state.result = null;
    rerender();
  });

  const copy = (text, done) => {
    if (!navigator.clipboard) { toast('مرورگر اجازه کپی نمی‌دهد', 'x'); return; }
    navigator.clipboard.writeText(text)
      .then(() => toast(done))
      .catch(() => toast('مرورگر اجازه کپی نداد', 'x'));
  };

  on('tr:copy', ({ what }) => {
    const r = state.result;
    if (!r) return;
    if (what === 'summary') copy(r.summary || '', 'خلاصه کپی شد.');
    else if (what === 'points') copy(r.points.map((p, i) => `${i + 1}. ${p.h}\n${p.p}`).join('\n\n'), 'نکته‌ها کپی شدند.');
    else copy((r.fa.length ? r.fa : r.paras).join('\n\n').replace(/<[^>]+>/g, ''), 'ترجمه کپی شد.');
  });

  on('tr:copy-point', ({ i }) => {
    const pt = state.result?.points[Number(i)];
    if (pt) copy(`${pt.h}\n${pt.p}`, 'این نکته کپی شد.');
  });

  /* Keep the textarea in sync so switching tabs never loses what was typed. */
  document.addEventListener('input', e => {
    if (e.target.id === 'trText') state.draft = e.target.value;
  });
}

export function resetTranslate() {
  state.stage = 'pick';
  state.input = 'library';
  state.out = 'fa';
  state.result = null;
}
