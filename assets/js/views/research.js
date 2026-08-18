/* §41–43 — Research: deep intelligence over the whole library. */
import { esc, icon, on, runSteps, num, words } from '../ui.js';
import { RESEARCH_PRESETS, TIMELINE, sourceName, topicName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, articleRow, emptyState } from './components.js';

const state = { question: '', result: null, running: false };

const STEPS = [
  { label: 'یافتن مقاله‌های مرتبط', note: '' },
  { label: 'دسته‌بندی منابع', note: '' },
  { label: 'ترکیب آنچه می‌گویند', note: '' },
  { label: 'ساختن خط زمانی', note: '' },
  { label: 'بررسی اختلاف‌نظرها', note: '' },
];

function match(q) {
  const asked = words(q);
  let best = null, bestScore = 0;
  for (const p of RESEARCH_PRESETS) {
    const score = p.match.filter(m => asked.some(w => w.startsWith(m.slice(0, 4)))).length;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

export function research() {
  const history = store.get().research;

  return {
    layout: 'app',
    title: 'پژوهش عمیق — پژوهش',
    html: `
      <div class="page narrow fade-in">
        <header class="page-head">
          <span class="eyebrow">هوشمندی عمیق</span>
          <h1 class="h1 mt-3">از کتابخانه‌تان بپرسید</h1>
          <p class="lead">پرسش‌ها از دل مقاله‌هایی که جمع کرده‌اید پاسخ می‌گیرند — همراه با منابع،
            خط زمانی، و اختلاف‌نظرها که پنهان نمی‌شوند.</p>
        </header>

        <div class="card">
          <div class="field">
            <textarea class="textarea" id="researchInput" placeholder="در سه ماه گذشته در «عامل‌های هوش مصنوعی» چه تغییر کرد؟"
              data-act-enter="research:run">${esc(state.question)}</textarea>
          </div>
          <div class="row between wrap gap-3 mt-4">
            <span class="xs muted-2">اینتر برای پرسیدن · شیفت+اینتر برای خط تازه</span>
            <button class="btn btn-primary" data-act="research:run" ${state.running ? 'disabled' : ''}>
              ${icon('spark', 14)} ${state.running ? 'در حال پژوهش…' : 'پژوهش'}
            </button>
          </div>
        </div>

        <div class="row wrap gap-2 mt-4">
          ${RESEARCH_PRESETS.map(p => `<button class="chip" data-act="research:ask" data-q="${esc(p.question)}">${esc(p.question)}</button>`).join('')}
        </div>

        <div id="researchOut" class="mt-6">${state.running ? '' : resultView()}</div>

        ${!state.running && !state.result && history.length ? `
          <section class="section mt-6">
            ${sectionHead('پرسش‌های اخیر')}
            <div class="rows">
              ${history.map(h => `
                <div class="list-row" data-act="research:ask" data-q="${esc(h.question)}">
                  <div class="grow"><p>${esc(h.question)}</p><p class="xs muted-2 mt-2">${num(h.sources)} منبع استفاده شد</p></div>
                  ${icon('left', 14)}
                </div>`).join('')}
            </div>
          </section>` : ''}
      </div>`,
  };
}

function resultView() {
  const r = state.result;
  if (!r) {
    return `
      <div class="card" style="border-style:dashed;background:transparent">
        <span class="eyebrow">تفاوت این با جست‌وجو</span>
        <p class="small muted mt-3" style="max-width:var(--measure)">
          جست‌وجو مقاله‌هایی را پیدا می‌کند که واژه‌های شما در آن‌ها هست. پژوهش آن‌ها را کنار هم می‌خواند و
          می‌گوید در مجموع چه می‌گویند — از جمله جایی که همدیگر را نقض می‌کنند. اگر کتابخانه شما برای پاسخ
          کافی نباشد، همین را می‌گوید و پاسخی از خودش نمی‌سازد.
        </p>
      </div>`;
  }

  if (!r.preset) {
    return `
      <div class="card fade-in">
        <span class="eyebrow">کتابخانه شما کافی نیست</span>
        <h2 class="h2 mt-3">«${esc(r.question)}»</h2>
        <p class="lead mt-4">کتابخانه شما برای پاسخ‌دادن به این پرسش بدون حدس‌زدن مطلب کافی ندارد،
          پس پاسخی داده نمی‌شود. ${num(r.candidates)} مقاله به موضوع نزدیک شده‌اند اما هیچ‌کدام مستقیماً به پرسش نپرداخته‌اند.</p>
        <div class="actions-inline mt-5">
          <button class="btn" data-act="add:open" data-kind="website">افزودن منبعی درباره این موضوع</button>
          <button class="btn btn-ghost" data-act="nav:go" data-id="/discover">رفتن به کشف</button>
        </div>
      </div>`;
  }

  const p = r.preset;
  const timeline = p.timelineTopic ? (TIMELINE[p.timelineTopic] || []) : [];

  return `
    <div class="fade-in">
      <section class="section">
        ${sectionHead('پاسخ')}
        <p class="lead" style="max-width:var(--measure)">${esc(p.answer)}</p>
        <p class="xs muted-2 mt-4">${icon('layers', 12)} بر پایه ${num(p.sources.length)} منبع در کتابخانه شما.</p>
      </section>

      <section class="section">
        ${sectionHead('یافته‌های کلیدی')}
        <ol class="insight-list">
          ${p.findings.map(f => `<li><div><p>${esc(f)}</p></div></li>`).join('')}
        </ol>
      </section>

      ${timeline.length ? `
        <section class="section">
          ${sectionHead('خط زمانی')}
          <div class="timeline">
            ${timeline.map(e => `
              <div class="timeline-item" data-major="${!!e.major}">
                <div class="timeline-month eyebrow">${esc(e.month)}</div>
                <p>${esc(e.text)}</p>
                <button class="link small mt-2" data-act="article:open" data-id="${e.source}">منبع</button>
              </div>`).join('')}
          </div>
        </section>` : ''}

      <section class="section">
        ${sectionHead('منابع استفاده‌شده')}
        <div class="rows">
          ${p.sources.map(id => {
            const a = store.findArticle(id);
            return a ? articleRow(a) : '';
          }).join('')}
        </div>
      </section>

      ${p.conflicts ? `
        <section class="section">
          ${sectionHead('دیدگاه‌های متعارض')}
          <div class="callout" style="border-color:color-mix(in srgb, var(--warn) 35%, var(--line));background:var(--warn-soft)">
            <p style="max-width:var(--measure)">${esc(p.conflicts)}</p>
            <p class="xs muted-2 mt-3">هر دو ادعا در کتابخانه شما می‌مانند. هیچ‌چیز به‌جای شما فیصله داده نشده است.</p>
          </div>
        </section>` : ''}

      <section class="section">
        ${sectionHead('برای مطالعه بیشتر')}
        <div class="rows">
          ${p.further.map(id => { const a = store.findArticle(id); return a ? articleRow(a) : ''; }).join('')}
        </div>
      </section>
    </div>`;
}

export function registerResearchActions(rerender) {
  const run = q => {
    state.question = q;
    state.running = true;
    state.result = null;
    rerender();
    const out = document.getElementById('researchOut');
    if (!out) return;
    const preset = match(q);
    const candidates = store.allArticles().filter(a =>
      words(q).filter(w => w.length > 3).some(w => `${a.title} ${a.summary}`.toLowerCase().includes(w))).length;

    out.innerHTML = '<div class="card"></div>';
    runSteps(out.firstElementChild, STEPS.map((s, i) => ({
      label: s.label,
      note: i === 0 ? `${num(Math.max(candidates, preset ? preset.sources.length : 0))} مورد یافت شد` : '',
    })), {
      onDone: () => {
        state.running = false;
        state.result = { question: q, preset, candidates };
        if (preset) store.addResearch({ question: q, sources: preset.sources.length });
        else store.signal('search', { label: q });
        rerender();
      },
    });
  };

  on('research:run', () => {
    const q = (document.getElementById('researchInput')?.value || '').trim();
    if (!q) return;
    run(q);
  });

  on('research:ask', ({ q }) => {
    if (location.hash !== '#/research') {
      location.hash = '#/research';
      setTimeout(() => run(q), 60);
    } else {
      run(q);
    }
  });
}

export function resetResearch() {
  state.result = null;
  state.running = false;
}
