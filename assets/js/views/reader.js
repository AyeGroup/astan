/* §28–35 · §50 — Article Reader. Order follows §53 content hierarchy:
   what happened → why it matters → what is new → what it relates to → source. */
import { esc, icon, on, toast, fmtDate, openModal, closeModal } from '../ui.js';
import { topicName, sourceName, ARTICLE_QA } from '../data.js';
import * as store from '../store.js';
import { sectionHead, articleCard, emptyState } from './components.js';

const state = { lang: 'en', mode: 'full', askOpen: false, thread: [] };

export function reader(segments) {
  const a = store.findArticle(segments[0]);
  if (!a) {
    return {
      layout: 'app', title: 'Article not found',
      html: `<div class="page">${emptyState({
        title: 'Article not found',
        body: 'This article is not in your library. It may have been removed.',
        cta: 'Back to Home', act: 'nav:go', arg: '/home',
      })}</div>`,
    };
  }

  store.markRead(a.id);
  const saved = store.isSaved(a.id);
  const related = store.feed()
    .filter(x => x.id !== a.id && (x.topic === a.topic || x.source === a.source))
    .slice(0, 3);
  const fromLibrary = store.allArticles()
    .filter(x => x.id !== a.id && x.topic === a.topic && (store.isSaved(x.id) || store.isRead(x.id)))
    .slice(0, 3);

  return {
    layout: 'app',
    title: `${a.title} — Research`,
    html: `
      <article class="reader fade-in">
        <button class="btn btn-sm btn-ghost" data-act="nav:back">${icon('left', 13)} Back</button>

        <!-- §29 Article header -->
        <header class="reader-head mt-4">
          <div class="row wrap gap-2">
            <span class="badge badge-topic">${esc(topicName(a.topic))}</span>
            <button class="badge" data-act="nav:go" data-id="/sources/${a.source}">${esc(sourceName(a.source))}</button>
            <span class="badge badge-outline">${store.personalRelevance(a)}% relevant</span>
          </div>
          <h1 class="reader-title">${esc(a.title)}</h1>
          <div class="meta">
            <span>${esc(a.author)}</span><span class="sep">·</span>
            <span>${esc(fmtDate(a.date))}</span><span class="sep">·</span>
            <span>${a.minutes} min read</span>
          </div>
        </header>

        <!-- Toolbar: actions + translation -->
        <div class="reader-toolbar">
          <button class="btn btn-sm" data-act="article:save" data-id="${a.id}" aria-pressed="${saved}">
            ${icon('bookmark', 14)} ${saved ? 'Saved' : 'Save'}
          </button>
          <div class="segmented" role="group" aria-label="Language">
            <button data-act="reader:lang" data-id="en" aria-pressed="${state.lang === 'en'}">Original</button>
            <button data-act="reader:lang" data-id="fa" aria-pressed="${state.lang === 'fa'}" lang="fa">فارسی</button>
          </div>
          ${state.lang === 'fa' ? `
            <div class="segmented" role="group" aria-label="Translation mode">
              ${[['full', 'Full'], ['paragraph', 'Paragraph'], ['summary', 'Summary']].map(([id, label]) =>
                `<button data-act="reader:mode" data-id="${id}" aria-pressed="${state.mode === id}">${label}</button>`).join('')}
            </div>` : ''}
          <span class="grow"></span>
          <button class="btn btn-sm btn-ghost" data-act="article:share" data-id="${a.id}">${icon('share', 14)} Share</button>
          <button class="btn btn-sm btn-ghost" data-act="article:why" data-id="${a.id}">Why this?</button>
        </div>

        <!-- §30 TL;DR -->
        <div class="callout callout-accent">
          <span class="eyebrow">TL;DR</span>
          <p class="tldr">${esc(a.tldr)}</p>
        </div>

        <!-- §31 Key insights -->
        <section class="section">
          ${sectionHead('Key insights')}
          <ol class="insight-list">
            ${a.insights.map(i => `<li><div><h4>${esc(i.h)}</h4><p>${esc(i.p)}</p></div></li>`).join('')}
          </ol>
        </section>

        <!-- §32 Why it matters — personalized -->
        <section class="section">
          <div class="callout">
            <span class="eyebrow">Why this matters to you</span>
            <p class="mt-3" style="max-width:var(--measure)">${esc(a.why)}</p>
            <p class="xs muted-2 mt-4">Based on your reading history and saved articles.</p>
          </div>
        </section>

        <!-- §33 What changed -->
        <section class="section">
          <div class="callout">
            <span class="eyebrow">What's new</span>
            <p class="mt-3" style="max-width:var(--measure)">${esc(a.changed)}</p>
            ${a.changed === 'No significant change detected.'
              ? '<p class="xs muted-2 mt-3">We only report differences we can point to in your library.</p>' : ''}
          </div>
        </section>

        <!-- §35 Ask AI — collapsed by default, per §60 -->
        <section class="section">
          ${askPanel(a)}
        </section>

        <!-- Article body -->
        <section class="section">
          ${sectionHead(state.lang === 'fa' ? 'ترجمه' : 'Article')}
          ${body(a)}
          <p class="xs muted-2 mt-6">
            Source: <a class="link" href="https://${esc((store.findSource(a.source) || {}).domain || 'example.com')}" target="_blank" rel="noopener">${esc(sourceName(a.source))} ${icon('external', 12)}</a>
            · ${esc(a.author)} · ${esc(fmtDate(a.date))}
          </p>
        </section>

        <!-- Related -->
        ${fromLibrary.length ? `
          <section class="section">
            ${sectionHead('Related to your research')}
            <div class="rows">
              ${fromLibrary.map(x => `
                <div class="list-row" data-act="article:open" data-id="${x.id}">
                  <div class="grow">
                    <p style="font-family:var(--font-serif)">${esc(x.title)}</p>
                    <p class="xs muted mt-2">${store.isSaved(x.id) ? 'You saved this' : 'You read this'} · ${esc(sourceName(x.source))}</p>
                  </div>
                  ${icon('right', 14)}
                </div>`).join('')}
            </div>
          </section>` : ''}

        <section class="section">
          ${sectionHead('Related articles')}
          <div class="grid grid-auto">${related.map(x => articleCard(x, { showReasons: false })).join('')}</div>
        </section>
      </article>

      <!-- §50 mobile bottom actions -->
      <div class="reader-actions-mobile">
        <button class="btn btn-sm" data-act="article:save" data-id="${a.id}">${icon('bookmark', 14)} ${saved ? 'Saved' : 'Save'}</button>
        <button class="btn btn-sm" data-act="reader:lang" data-id="${state.lang === 'fa' ? 'en' : 'fa'}">${icon('globe', 14)} ${state.lang === 'fa' ? 'Original' : 'Translate'}</button>
        <button class="btn btn-sm" data-act="reader:ask-open">${icon('spark', 14)} Ask AI</button>
      </div>`,
  };
}

/* §34 Translation UX — three modes. */
function body(a) {
  const en = a.body || [];
  const fa = a.fa || [];
  const render = (paras, rtl) => paras.map(p =>
    p.startsWith('## ') ? `<h2>${esc(p.slice(3))}</h2>`
    : p.startsWith('> ') ? `<blockquote>${esc(p.slice(2))}</blockquote>`
    : `<p>${p.includes('<span class="term"') ? p : esc(p)}</p>`).join('');

  if (state.lang === 'en') return `<div class="prose">${render(en)}</div>`;

  if (state.mode === 'summary') {
    const gist = fa.filter(p => !p.startsWith('## ') && !p.startsWith('> ')).slice(0, 2);
    return `
      <div class="callout" style="margin-bottom:var(--s-5)">
        <span class="eyebrow">حالت خلاصه</span>
        <p class="xs muted mt-2" dir="rtl">فقط مغز مطلب، نه ترجمه کامل.</p>
      </div>
      <div class="prose" dir="rtl" lang="fa">${render(gist)}</div>`;
  }

  if (state.mode === 'paragraph') {
    const pairs = Math.max(en.length, fa.length);
    let out = '';
    for (let i = 0; i < pairs; i += 1) {
      if (en[i]) out += `<div class="prose">${render([en[i]])}</div>`;
      if (fa[i]) out += `<div class="prose" dir="rtl" lang="fa" style="border-inline-start:2px solid var(--line);padding-inline-start:var(--s-4);margin:0 0 var(--s-6)">${render([fa[i]])}</div>`;
    }
    return out;
  }

  return `<div class="prose" dir="rtl" lang="fa">${render(fa)}</div>`;
}

/* §35 — assistant scoped to this article. */
function askPanel(a) {
  const presets = Object.keys(ARTICLE_QA);
  return `
    <div class="ask-panel">
      <button class="ask-head" data-act="reader:ask-toggle">
        <span class="row gap-3">${icon('spark')} <b>Ask about this article</b></span>
        <span class="row gap-2 xs muted">${state.askOpen ? 'Hide' : 'Open'} ${icon('down', 13)}</span>
      </button>
      ${state.askOpen ? `
        <div class="ask-body">
          <div class="ask-thread">
            ${state.thread.length ? state.thread.map(m => `
              <div class="ask-msg ${m.role}">
                <span class="who">${m.role === 'user' ? 'You' : 'Research'}</span>
                <p>${esc(m.text)}</p>
                ${m.role === 'ai' ? `
                  <div class="ask-sources">
                    <button class="badge" data-act="article:open" data-id="${a.id}">${icon('file', 12)} ${esc(a.title.slice(0, 44))}${a.title.length > 44 ? '…' : ''}</button>
                  </div>
                  <p class="xs muted-2">Answered only from this article. Nothing outside it was used.</p>` : ''}
              </div>`).join('')
              : '<p class="small muted">Answers are drawn from this article alone. If it does not contain the answer, we say so.</p>'}
          </div>
          <div class="row wrap gap-2" style="margin-bottom:var(--s-4)">
            ${presets.map(q => `<button class="chip" data-act="reader:preset" data-id="${a.id}" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
          </div>
          <div class="row gap-2">
            <input class="input" id="askInput" placeholder="Ask anything about this article…"
              data-act-enter="reader:ask-send" data-id="${a.id}" autocomplete="off">
            <button class="btn btn-primary" data-act="reader:ask-send" data-id="${a.id}">Ask</button>
          </div>
        </div>` : ''}
    </div>`;
}

export function registerReaderActions(rerender) {
  on('reader:lang', ({ id }) => { state.lang = id; rerender(); });
  on('reader:mode', ({ id }) => { state.mode = id; rerender(); });
  on('reader:ask-toggle', () => { state.askOpen = !state.askOpen; rerender(); });
  on('reader:ask-open', () => {
    state.askOpen = true;
    rerender();
    setTimeout(() => document.getElementById('askInput')?.focus(), 60);
  });

  const answer = (a, q) => {
    const canned = ARTICLE_QA[q];
    if (canned) return canned(a);
    const hay = `${a.title} ${a.summary} ${a.tldr} ${a.insights.map(i => i.h + i.p).join(' ')}`.toLowerCase();
    const hit = q.toLowerCase().split(/\s+/).filter(w => w.length > 4).some(w => hay.includes(w));
    return hit
      ? `From this article: ${a.tldr} The text supports this directly; anything beyond it is not in the source, so it is not included here.`
      : 'This article does not contain enough to answer that. Rather than guess, try Research, which can draw on your whole library.';
  };

  const send = (id, q) => {
    const a = store.findArticle(id);
    if (!a || !q) return;
    state.thread = [...state.thread, { role: 'user', text: q }, { role: 'ai', text: answer(a, q) }];
    store.signal('ask', { topicId: a.topic, label: q });
    rerender();
  };

  on('reader:preset', ({ id, q }) => send(id, q));
  on('reader:ask-send', ({ id }) => {
    const input = document.getElementById('askInput');
    const q = (input?.value || '').trim();
    if (!q) return;
    send(id, q);
  });
}

export function resetReader() {
  state.lang = 'en';
  state.mode = 'full';
  state.askOpen = false;
  state.thread = [];
}
