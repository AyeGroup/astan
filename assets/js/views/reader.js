/* §28–35 · §50 — Article Reader. Order follows §53 content hierarchy:
   what happened → why it matters → what is new → what it relates to → source. */
import { esc, icon, on, toast, fmtDate, num, words, openModal, closeModal } from '../ui.js';
import { topicName, sourceName, ARTICLE_QA } from '../data.js';
import * as store from '../store.js';
import { sectionHead, mini, emptyState, score } from './components.js';

const state = { lang: 'fa', mode: 'full', askOpen: false, thread: [] };

export function reader(segments) {
  const a = store.findArticle(segments[0]);
  if (!a) {
    return {
      layout: 'app', title: 'مقاله پیدا نشد',
      html: `<div class="page">${emptyState({
        title: 'این مقاله پیدا نشد',
        body: 'شاید آن را حذف کرده‌اید یا لینکش درست نیست.',
        cta: 'برگردید به خانه', act: 'nav:go', arg: '/home',
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
    title: `${a.title} — پژوهش`,
    html: `
      <article class="reader fade-in">
        <button class="btn btn-sm btn-ghost" data-act="nav:back">${icon('right', 13)} بازگشت</button>

        <!-- §29 Article header -->
        <header class="reader-head mt-4">
          <div class="row wrap gap-2 between">
            <div class="row wrap gap-2">
              <span class="tag tag-red">${esc(topicName(a.topic))}</span>
              <button class="tag latin" data-act="nav:go" data-id="/sources/${a.source}">${esc(sourceName(a.source))}</button>
            </div>
            ${score(store.personalRelevance(a))}
          </div>
          <h1 class="reader-title">${esc(a.title)}</h1>
          <div class="meta">
            <span class="latin">${esc(a.author)}</span><span class="sep">·</span>
            <span>${esc(fmtDate(a.date))}</span><span class="sep">·</span>
            <span>${num(a.minutes)} دقیقه مطالعه</span>
          </div>
          ${a.titleOriginal ? `<p class="reader-orig mt-4 latin">${esc(a.titleOriginal)}</p>` : ''}
        </header>

        <!-- Toolbar: actions + translation -->
        <div class="reader-bar">
          <button class="btn btn-sm" data-act="article:save" data-id="${a.id}" aria-pressed="${saved}">
            ${icon('bookmark', 14)} ${saved ? 'ذخیره شد' : 'ذخیره'}
          </button>
          <div class="seg" role="group" aria-label="زبان">
            <button data-act="reader:lang" data-id="fa" aria-pressed="${state.lang === 'fa'}">فارسی</button>
            <button data-act="reader:lang" data-id="en" aria-pressed="${state.lang === 'en'}">اصلی</button>
          </div>
          ${state.lang === 'fa' ? `
            <div class="seg" role="group" aria-label="حالت ترجمه">
              ${[['full', 'کامل'], ['paragraph', 'بند به بند'], ['summary', 'خلاصه']].map(([id, label]) =>
                `<button data-act="reader:mode" data-id="${id}" aria-pressed="${state.mode === id}">${label}</button>`).join('')}
            </div>` : ''}
          <span class="grow"></span>
          <button class="btn btn-sm btn-ghost" data-act="article:share" data-id="${a.id}">${icon('share', 14)} هم‌رسانی</button>
          <button class="btn btn-sm btn-ghost" data-act="article:why" data-id="${a.id}">چرا این؟</button>
        </div>

        <!-- §30 — readable in 15 seconds -->
        <div class="block block-red">
          <span class="label">خلاصه مقاله در سه خط</span>
          <p class="big">${esc(a.tldr)}</p>
        </div>

        <!-- §31 Key insights -->
        <div class="block">
          <span class="label">نکته‌های مهم مقاله</span>
          <ol class="points mt-4">
            ${a.insights.map(i => `<li><div><h4>${esc(i.h)}</h4><p>${esc(i.p)}</p></div></li>`).join('')}
          </ol>
        </div>

        <!-- §32 Why it matters — personalized -->
        <div class="block">
          <span class="label">چرا این مقاله را برای شما انتخاب کردیم</span>
          <p>${esc(a.why)}</p>
        </div>

        <!-- §33 What changed -->
        <div class="block">
          <span class="label">فرقش با مقاله‌هایی که خوانده‌اید</span>
          <p>${esc(a.changed)}</p>
        </div>

        <!-- §35 · §60 — collapsed until the reader wants it -->
        <div style="margin-bottom:var(--s-6)">${askPanel(a)}</div>

        <!-- Article body -->
        <section class="section">
          ${sectionHead(state.lang === 'fa' ? 'متن کامل' : 'متن اصلی')}
          ${body(a)}
          <p class="xs muted-2 mt-6">
            این مقاله از <a class="link latin" href="https://${esc((store.findSource(a.source) || {}).domain || 'example.com')}" target="_blank" rel="noopener">${esc(sourceName(a.source))} ${icon('external', 12)}</a> است
            · <span class="latin">${esc(a.author)}</span> · ${esc(fmtDate(a.date))}
          </p>
        </section>

        <!-- Related -->
        ${fromLibrary.length ? `
          <section class="section">
            ${sectionHead('از مقاله‌هایی که قبلاً خوانده‌اید')}
            <div class="rows">
              ${fromLibrary.map(x => `
                <div class="list-row" data-act="article:open" data-id="${x.id}">
                  <div class="grow">
                    <p class="editorial" style="font-size:1.125rem;line-height:1.55">${esc(x.title)}</p>
                    <p class="xs muted mt-2">${store.isSaved(x.id) ? 'این را ذخیره کرده‌اید' : 'این را خوانده‌اید'} · <span class="latin">${esc(sourceName(x.source))}</span></p>
                  </div>
                  ${icon('left', 14)}
                </div>`).join('')}
            </div>
          </section>` : ''}

        <section class="section">
          ${sectionHead('مقاله‌های شبیه این')}
          <div class="grid grid-auto">${related.map(mini).join('')}</div>
        </section>
      </article>

      <!-- §50 mobile bottom actions -->
      <div class="reader-mobile">
        <button class="btn btn-sm" data-act="article:save" data-id="${a.id}">${icon('bookmark', 14)} ${saved ? 'ذخیره شد' : 'ذخیره'}</button>
        <button class="btn btn-sm" data-act="reader:lang" data-id="${state.lang === 'fa' ? 'en' : 'fa'}">${icon('globe', 14)} ${state.lang === 'fa' ? 'اصلی' : 'ترجمه'}</button>
        <button class="btn btn-sm" data-act="reader:ask-open">${icon('spark', 14)} پرسش</button>
      </div>`,
  };
}

/* §34 Translation UX — Persian by default, three modes, original on demand. */
function body(a) {
  const fa = a.body || [];
  const en = a.original || [];
  const render = paras => paras.map(p =>
    p.startsWith('## ') ? `<h2>${esc(p.slice(3))}</h2>`
    : p.startsWith('> ') ? `<blockquote>${esc(p.slice(2))}</blockquote>`
    : `<p>${p.includes('<span class="term"') ? p : esc(p)}</p>`).join('');

  /* The source language, shown exactly as published. */
  if (state.lang === 'en') {
    return `
      <div class="block">
        <span class="label">متن اصلی</span>
        <p class="xs muted mt-2">این متن به زبان اصلی مقاله است و ترجمه نشده.</p>
      </div>
      <div class="prose" dir="ltr" lang="en">${render(en)}</div>`;
  }

  if (state.mode === 'summary') {
    const gist = fa.filter(p => !p.startsWith('## ') && !p.startsWith('> ')).slice(0, 2);
    return `
      <div class="block">
        <span class="label">فقط خلاصه</span>
        <p class="xs muted mt-2">فقط مهم‌ترین بخش‌های مقاله، نه ترجمه کامل آن.</p>
      </div>
      <div class="prose">${render(gist)}</div>`;
  }

  /* Paragraph mode pairs each translated block with its source. */
  if (state.mode === 'paragraph') {
    const rows = Math.max(en.length, fa.length);
    let out = '';
    for (let i = 0; i < rows; i += 1) {
      if (fa[i]) out += `<div class="prose">${render([fa[i]])}</div>`;
      if (en[i]) out += `<div class="prose" dir="ltr" lang="en" style="border-inline-start:2px solid var(--line);padding-inline-start:var(--s-4);margin:0 0 var(--s-6);font-size:var(--t-body)">${render([en[i]])}</div>`;
    }
    return out;
  }

  return `<div class="prose">${render(fa)}</div>`;
}

/* §35 — assistant scoped to this article. */
function askPanel(a) {
  const presets = Object.keys(ARTICLE_QA);
  return `
    <div class="ask">
      <button class="ask-head" data-act="reader:ask-toggle">
        <span class="row gap-4">
          <span class="ask-ico">${icon('spark', 17)}</span>
          <span>
            <b style="display:block">سؤالی درباره این مقاله دارید؟</b>
            <span class="xs muted">جواب را فقط از متن همین مقاله می‌دهیم</span>
          </span>
        </span>
        <span class="row gap-2 xs muted">${state.askOpen ? 'بستن' : 'باز کردن'} ${icon('down', 13)}</span>
      </button>
      ${state.askOpen ? `
        <div class="ask-body">
          <div class="ask-thread">
            ${state.thread.length ? state.thread.map(m => `
              <div class="msg ${m.role}">
                <span class="who">${m.role === 'user' ? 'شما' : 'پژوهش'}</span>
                <p>${esc(m.text)}</p>
                ${m.role === 'ai' ? `
                  <div class="ask-sources">
                    <button class="tag" data-act="article:open" data-id="${a.id}">${icon('file', 12)} ${esc(a.title.slice(0, 44))}${a.title.length > 44 ? '…' : ''}</button>
                  </div>
                  <p class="xs muted-2 mt-2">این جواب فقط از متن همین مقاله ساخته شده است.</p>` : ''}
              </div>`).join('')
              : '<p class="small muted">یکی از سؤال‌های آماده را انتخاب کنید، یا سؤال خودتان را بنویسید.</p>'}
          </div>
          <div class="row wrap gap-2" style="margin-bottom:var(--s-4)">
            ${presets.map(q => `<button class="chip" data-act="reader:preset" data-id="${a.id}" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
          </div>
          <div class="row gap-2">
            <input class="input" id="askInput" placeholder="سؤالتان را بنویسید…"
              data-act-enter="reader:ask-send" data-id="${a.id}" autocomplete="off">
            <button class="btn btn-primary" data-act="reader:ask-send" data-id="${a.id}">بپرس</button>
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
    const hit = words(q).filter(w => w.length > 3).some(w => hay.includes(w));
    return hit
      ? `${a.tldr}`
      : 'جواب این سؤال در متن این مقاله نیست و ما هم حدس نمی‌زنیم. اگر می‌خواهید از همه مقاله‌هایتان بپرسیم، از بخش «پرسیدن» در نوار بالا استفاده کنید.';
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
  state.lang = 'fa';
  state.mode = 'full';
  state.askOpen = false;
  state.thread = [];
}
