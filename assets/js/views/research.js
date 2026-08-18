/* §41–43 — Research: deep intelligence over the whole library. */
import { esc, icon, on, runSteps } from '../ui.js';
import { RESEARCH_PRESETS, TIMELINE, sourceName, topicName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, articleRow, emptyState } from './components.js';

const state = { question: '', result: null, running: false };

const STEPS = [
  { label: 'Finding related articles', note: '' },
  { label: 'Grouping sources', note: '' },
  { label: 'Combining what they say', note: '' },
  { label: 'Building a timeline', note: '' },
  { label: 'Checking for disagreement', note: '' },
];

function match(q) {
  const words = q.toLowerCase().split(/\W+/).filter(Boolean);
  let best = null, bestScore = 0;
  for (const p of RESEARCH_PRESETS) {
    const score = p.match.filter(m => words.some(w => w.startsWith(m.slice(0, 4)))).length;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

export function research() {
  const history = store.get().research;

  return {
    layout: 'app',
    title: 'Research — Research',
    html: `
      <div class="page narrow fade-in">
        <header class="page-head">
          <span class="eyebrow">Deep intelligence</span>
          <h1 class="h1 mt-3">Ask your library</h1>
          <p class="lead">Questions are answered from the articles you have collected — with sources,
            a timeline, and any disagreement between them left visible.</p>
        </header>

        <div class="card">
          <div class="field">
            <textarea class="textarea" id="researchInput" placeholder="What changed in AI Agents during the last 3 months?"
              data-act-enter="research:run">${esc(state.question)}</textarea>
          </div>
          <div class="row between wrap gap-3 mt-4">
            <span class="xs muted-2">Enter to ask · Shift+Enter for a new line</span>
            <button class="btn btn-primary" data-act="research:run" ${state.running ? 'disabled' : ''}>
              ${icon('spark', 14)} ${state.running ? 'Researching…' : 'Research'}
            </button>
          </div>
        </div>

        <div class="row wrap gap-2 mt-4">
          ${RESEARCH_PRESETS.map(p => `<button class="chip" data-act="research:ask" data-q="${esc(p.question)}">${esc(p.question)}</button>`).join('')}
        </div>

        <div id="researchOut" class="mt-6">${state.running ? '' : resultView()}</div>

        ${!state.running && !state.result && history.length ? `
          <section class="section mt-6">
            ${sectionHead('Recent questions')}
            <div class="rows">
              ${history.map(h => `
                <div class="list-row" data-act="research:ask" data-q="${esc(h.question)}">
                  <div class="grow"><p>${esc(h.question)}</p><p class="xs muted-2 mt-2">${h.sources} sources used</p></div>
                  ${icon('right', 14)}
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
        <span class="eyebrow">How this differs from search</span>
        <p class="small muted mt-3" style="max-width:var(--measure)">
          Search finds articles that contain your words. Research reads across them and tells you what
          they collectively say — including where they contradict each other. If your library does not
          hold enough to answer, it says that instead of inventing one.
        </p>
      </div>`;
  }

  if (!r.preset) {
    return `
      <div class="card fade-in">
        <span class="eyebrow">Not enough in your library</span>
        <h2 class="h2 mt-3">"${esc(r.question)}"</h2>
        <p class="lead mt-4">Your library does not contain enough material to answer this without guessing,
          so no answer is given. ${r.candidates} article${r.candidates === 1 ? '' : 's'} touched the subject but none addressed the question directly.</p>
        <div class="actions-inline mt-5">
          <button class="btn" data-act="add:open" data-kind="website">Add a source on this subject</button>
          <button class="btn btn-ghost" data-act="nav:go" data-id="/discover">Browse Discover</button>
        </div>
      </div>`;
  }

  const p = r.preset;
  const timeline = p.timelineTopic ? (TIMELINE[p.timelineTopic] || []) : [];

  return `
    <div class="fade-in">
      <section class="section">
        ${sectionHead('Answer')}
        <p class="lead" style="max-width:var(--measure)">${esc(p.answer)}</p>
        <p class="xs muted-2 mt-4">${icon('layers', 12)} Based on ${p.sources.length} sources in your library.</p>
      </section>

      <section class="section">
        ${sectionHead('Key findings')}
        <ol class="insight-list">
          ${p.findings.map(f => `<li><div><p>${esc(f)}</p></div></li>`).join('')}
        </ol>
      </section>

      ${timeline.length ? `
        <section class="section">
          ${sectionHead('Timeline')}
          <div class="timeline">
            ${timeline.map(e => `
              <div class="timeline-item" data-major="${!!e.major}">
                <div class="timeline-month eyebrow">${esc(e.month)}</div>
                <p>${esc(e.text)}</p>
                <button class="link small mt-2" data-act="article:open" data-id="${e.source}">Source</button>
              </div>`).join('')}
          </div>
        </section>` : ''}

      <section class="section">
        ${sectionHead('Sources used')}
        <div class="rows">
          ${p.sources.map(id => {
            const a = store.findArticle(id);
            return a ? articleRow(a) : '';
          }).join('')}
        </div>
      </section>

      ${p.conflicts ? `
        <section class="section">
          ${sectionHead('Conflicting views')}
          <div class="callout" style="border-color:color-mix(in srgb, var(--warn) 35%, var(--line));background:var(--warn-soft)">
            <p style="max-width:var(--measure)">${esc(p.conflicts)}</p>
            <p class="xs muted-2 mt-3">Both claims stay in your library. Nothing has been resolved on your behalf.</p>
          </div>
        </section>` : ''}

      <section class="section">
        ${sectionHead('Further reading')}
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
      q.toLowerCase().split(/\W+/).filter(w => w.length > 4).some(w => `${a.title} ${a.summary}`.toLowerCase().includes(w))).length;

    out.innerHTML = '<div class="card"></div>';
    runSteps(out.firstElementChild, STEPS.map((s, i) => ({
      label: s.label,
      note: i === 0 ? `${Math.max(candidates, preset ? preset.sources.length : 0)} matched` : '',
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
