/* §25 Discover · §36 Library */
import { esc, icon, on, num } from '../ui.js';
import { TOPICS, topicName, sourceName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, articleCard, articleRow, emptyState, tabBar } from './components.js';

/* ------------------------------------------------------------- Discover */
export function discover() {
  const ranked = store.feed({ excludeRead: true });
  const forYou = ranked.slice(0, 3);
  const trending = [...ranked]
    .sort((a, b) => (TOPICS.find(t => t.id === b.topic)?.momentum ?? 0) - (TOPICS.find(t => t.id === a.topic)?.momentum ?? 0))
    .slice(0, 3);
  const fresh = [...store.feed()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const followed = store.get().followedTopics;

  return {
    layout: 'app',
    title: 'کشف — پژوهش',
    html: `
      <div class="page fade-in">
        <header class="page-head">
          <h1 class="h1">کشف</h1>
          <p class="lead">مطالبی که هنوز در کتابخانه شما نیستند، رتبه‌بندی‌شده در برابر آنچه می‌دانید.</p>
        </header>

        <section class="section">
          ${sectionHead('برای شما', '<span class="xs muted-2">مرتب‌شده بر پایه ارتباط شخصی</span>')}
          ${forYou.length ? `<div class="grid grid-auto">${forYou.map(a => articleCard(a)).join('')}</div>`
            : emptyState({
                title: 'به‌روز هستید',
                body: 'هرچه در حال حاضر مرتبط بوده خوانده شده. با بررسی دوباره منابع، مطالب تازه می‌رسد.',
                cta: 'افزودن منبع', act: 'add:open', arg: 'website',
              })}
        </section>

        <section class="section">
          ${sectionHead('داغ در موضوع‌های شما')}
          <div class="grid grid-auto">${trending.map(a => articleCard(a, { showReasons: false })).join('')}</div>
        </section>

        <section class="section">
          ${sectionHead('تازه از منابع شما',
            `<button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/sources">مدیریت منابع ${icon('left', 13)}</button>`)}
          <div class="rows">${fresh.map(articleRow).join('')}</div>
        </section>

        <section class="section">
          ${sectionHead('کاوش موضوع‌ها')}
          <div class="grid grid-auto">
            ${TOPICS.map(t => `
              <div class="card card-hover card-tight">
                <div class="row between">
                  <button class="link editorial" data-act="nav:go" data-id="/topics/${t.id}" style="font-size:1.25rem;border:0">${esc(t.name)}</button>
                  <span class="${t.momentum >= 0 ? 'trend-up' : 'muted small'}">${t.momentum >= 0 ? '+' : '−'}٪${num(Math.abs(t.momentum))}</span>
                </div>
                <p class="xs muted mt-2">${num(t.articles)} مقاله · ${num(t.sources)} منبع</p>
                <button class="btn btn-sm mt-4" data-act="topic:follow" data-id="${t.id}">
                  ${followed.includes(t.id) ? `${icon('check', 13)} دنبال می‌کنید` : 'دنبال کردن'}
                </button>
              </div>`).join('')}
          </div>
        </section>
      </div>`,
  };
}

/* -------------------------------------------------------------- Library */
const lib = { tab: 'all', q: '', topic: '', source: '', sort: 'newest' };

export function library() {
  const all = store.allArticles();
  const byTab = {
    all: all,
    saved: all.filter(a => store.isSaved(a.id)),
    read: all.filter(a => store.isRead(a.id)),
    unread: all.filter(a => !store.isRead(a.id)),
    imported: store.get().extraArticles,
  };

  let list = byTab[lib.tab] || all;
  if (lib.q) {
    const q = lib.q.toLowerCase();
    list = list.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      (a.author || '').toLowerCase().includes(q));
  }
  if (lib.topic) list = list.filter(a => a.topic === lib.topic);
  if (lib.source) list = list.filter(a => a.source === lib.source);

  const sorters = {
    newest: (a, b) => b.date.localeCompare(a.date),
    relevance: (a, b) => store.personalRelevance(b) - store.personalRelevance(a),
    recent: (a, b) => store.get().read.indexOf(a.id) - store.get().read.indexOf(b.id),
  };
  list = [...list].sort(sorters[lib.sort] || sorters.newest);

  const sources = store.allSources();

  return {
    layout: 'app',
    title: 'کتابخانه — پژوهش',
    html: `
      <div class="page fade-in">
        <header class="page-head">
          <h1 class="h1">کتابخانه</h1>
          <p class="lead">هرچه جمع‌آوری، مطالعه یا وارد کرده‌اید.</p>
        </header>

        ${tabBar([
          { id: 'all', label: 'همه', count: byTab.all.length },
          { id: 'saved', label: 'ذخیره‌شده', count: byTab.saved.length },
          { id: 'read', label: 'خوانده‌شده', count: byTab.read.length },
          { id: 'unread', label: 'نخوانده', count: byTab.unread.length },
          { id: 'imported', label: 'واردشده', count: byTab.imported.length },
        ], lib.tab, 'lib:tab')}

        <div class="row wrap gap-2" style="margin-bottom:var(--s-5)">
          <div class="grow" style="min-width:220px;position:relative">
            <input class="input" id="libSearch" placeholder="جست‌وجو در پژوهش شما…" value="${esc(lib.q)}"
              data-act-enter="lib:search" autocomplete="off">
          </div>
          <select class="select" style="width:auto" data-act="lib:topic" id="libTopic">
            <option value="">همه موضوع‌ها</option>
            ${TOPICS.map(t => `<option value="${t.id}" ${lib.topic === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
          <select class="select" style="width:auto" data-act="lib:source" id="libSource">
            <option value="">همه منابع</option>
            ${sources.map(s => `<option value="${s.id}" ${lib.source === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
          </select>
          <select class="select" style="width:auto" data-act="lib:sort" id="libSort">
            <option value="newest" ${lib.sort === 'newest' ? 'selected' : ''}>تازه‌ترین</option>
            <option value="relevance" ${lib.sort === 'relevance' ? 'selected' : ''}>مرتبط‌ترین</option>
            <option value="recent" ${lib.sort === 'recent' ? 'selected' : ''}>اخیراً خوانده‌شده</option>
          </select>
          ${(lib.q || lib.topic || lib.source) ? '<button class="btn btn-sm btn-ghost" data-act="lib:clear">پاک کردن</button>' : ''}
        </div>

        ${list.length ? `
          <p class="xs muted-2" style="margin-bottom:var(--s-2)">${num(list.length)} مورد</p>
          <div class="rows">${list.map(articleRow).join('')}</div>`
          : emptyState({
              title: 'کتابخانه پژوهش شما منتظر است.',
              body: 'یک مقاله یا سایت اضافه کنید تا ساختن پایگاه دانش شخصی شما را آغاز کنیم.',
              cta: 'افزودن نخستین منبع', act: 'add:open', arg: 'article',
            })}
      </div>`,
  };
}

export function registerBrowseActions(rerender) {
  const setLib = patch => { Object.assign(lib, patch); rerender(); };
  on('lib:tab', ({ id }) => setLib({ tab: id }));
  on('lib:search', () => setLib({ q: document.getElementById('libSearch').value.trim() }));
  on('lib:clear', () => setLib({ q: '', topic: '', source: '' }));

  document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'libTopic') setLib({ topic: el.value });
    if (el.id === 'libSource') setLib({ source: el.value });
    if (el.id === 'libSort') setLib({ sort: el.value });
  });
}

export const librarySearch = q => { lib.q = q; lib.tab = 'all'; };
