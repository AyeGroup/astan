/* §41–43 — Research: deep intelligence over the whole library. */
import { esc, icon, on, runSteps, num, words } from '../ui.js';
import { RESEARCH_PRESETS, TIMELINE, sourceName, topicName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, articleRow, emptyState } from './components.js';

const state = { question: '', result: null, running: false };

const STEPS = [
  { label: 'پیدا کردن مقاله‌های مرتبط', note: '' },
  { label: 'مرتب‌کردن منبع‌ها', note: '' },
  { label: 'کنار هم گذاشتن حرف‌هایشان', note: '' },
  { label: 'ساختن سیر اتفاق‌ها', note: '' },
  { label: 'دیدن اینکه کجا با هم اختلاف دارند', note: '' },
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
    title: 'پرسیدن — پژوهش',
    html: `
      <div class="page narrow fade-in">
        <header class="page-head">
          <span class="label">از کتابخانه‌تان بپرسید</span>
          <h1 class="h1 mt-3">سؤالتان را بپرسید</h1>
          <p class="muted">جواب را از مقاله‌های خودتان می‌سازیم و می‌گوییم از کدام مقاله آمده.
            اگر منبع‌ها با هم اختلاف داشتند، هر دو را نشان می‌دهیم.</p>
        </header>

        <div class="card">
          <div class="field">
            <textarea class="textarea" id="researchInput" placeholder="مثلاً: در سه ماه گذشته چه تغییری در عامل‌ها بوده؟"
              data-act-enter="research:run">${esc(state.question)}</textarea>
          </div>
          <div class="row between wrap gap-3 mt-4">
            <span class="xs muted-2">اینتر = بپرس</span>
            <button class="btn btn-primary" data-act="research:run" ${state.running ? 'disabled' : ''}>
              ${icon('spark', 14)} ${state.running ? 'دارم می‌گردم…' : 'بپرس'}
            </button>
          </div>
        </div>

        <div class="row wrap gap-2 mt-4">
          ${RESEARCH_PRESETS.map(p => `<button class="chip" data-act="research:ask" data-q="${esc(p.question)}">${esc(p.question)}</button>`).join('')}
        </div>

        <div id="researchOut" class="mt-6">${state.running ? '' : resultView()}</div>

        ${!state.running && !state.result && history.length ? `
          <section class="section mt-6">
            ${sectionHead('سؤال‌های قبلی شما')}
            <div class="rows">
              ${history.map(h => `
                <div class="list-row" data-act="research:ask" data-q="${esc(h.question)}">
                  <div class="grow"><p>${esc(h.question)}</p><p class="xs muted-2 mt-2">از ${num(h.sources)} مقاله</p></div>
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
        <span class="label">فرقش با جست‌وجو چیست؟</span>
        <p class="small muted mt-3">
          جست‌وجو مقاله‌هایی را پیدا می‌کند که کلمه شما در آن‌هاست.
          اینجا مقاله‌ها را کنار هم می‌خوانیم و یک جواب می‌سازیم.
          اگر جواب در مقاله‌های شما نباشد، همین را می‌گوییم و چیزی از خودمان نمی‌سازیم.
        </p>
      </div>`;
  }

  if (!r.preset) {
    return `
      <div class="card fade-in">
        <span class="label">جواب این را نداریم</span>
        <h2 class="h2 mt-3">«${esc(r.question)}»</h2>
        <p class="muted mt-4">مقاله‌های شما جواب این سؤال را ندارند و ما هم چیزی از خودمان نمی‌سازیم.
          ${num(r.candidates)} مقاله نزدیک بودند، ولی هیچ‌کدام دقیقاً به این سؤال جواب نمی‌دهند.</p>
        <div class="actions-inline mt-5">
          <button class="btn" data-act="add:open" data-kind="website">یک منبع درباره‌اش اضافه کنید</button>
          <button class="btn btn-ghost" data-act="nav:go" data-id="/discover">دیدن پیشنهادها</button>
        </div>
      </div>`;
  }

  const p = r.preset;
  const timeline = p.timelineTopic ? (TIMELINE[p.timelineTopic] || []) : [];

  return `
    <div class="fade-in">
      <section class="section">
        ${sectionHead('پاسخ')}
        <p class="lead">${esc(p.answer)}</p>
        <p class="xs muted-2 mt-4">${icon('layers', 12)} از ${num(p.sources.length)} مقاله در کتابخانه شما</p>
      </section>

      <section class="section">
        ${sectionHead('نکته‌های اصلی')}
        <ol class="points">
          ${p.findings.map(f => `<li><div><p>${esc(f)}</p></div></li>`).join('')}
        </ol>
      </section>

      ${timeline.length ? `
        <section class="section">
          ${sectionHead('به ترتیب زمان')}
          <div class="timeline">
            ${timeline.map(e => `
              <div class="timeline-item" data-major="${!!e.major}">
                <div class="timeline-when">${esc(e.month)}</div>
                <p>${esc(e.text)}</p>
                <button class="link small mt-2" data-act="article:open" data-id="${e.source}">منبع</button>
              </div>`).join('')}
          </div>
        </section>` : ''}

      <section class="section">
        ${sectionHead('این جواب از کجا آمد')}
        <div class="rows">
          ${p.sources.map(id => {
            const a = store.findArticle(id);
            return a ? articleRow(a) : '';
          }).join('')}
        </div>
      </section>

      ${p.conflicts ? `
        <section class="section">
          ${sectionHead('اینجا منبع‌ها با هم اختلاف دارند')}
          <div class="block block-red">
            <p style="max-width:var(--measure)">${esc(p.conflicts)}</p>
            <p class="xs muted-2 mt-3">ما به‌جای شما تصمیم نمی‌گیریم کدام درست است.</p>
          </div>
        </section>` : ''}

      <section class="section">
        ${sectionHead('اگر بیشتر خواستید')}
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
