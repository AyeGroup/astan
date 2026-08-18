/* §25 Discover · §36 Library */
import { esc, icon, on } from '../ui.js';
import { TOPICS, topicName, sourceName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, articleCard, articleRow, emptyState, tabBar } from './components.js';

/* ------------------------------------------------------------- Discover */
export function discover() {
  const ranked = store.feed({ excludeRead: true });
  const forYou = ranked.slice(0, 4);
  const trending = [...ranked]
    .sort((a, b) => (TOPICS.find(t => t.id === b.topic)?.momentum ?? 0) - (TOPICS.find(t => t.id === a.topic)?.momentum ?? 0))
    .slice(0, 3);
  const fresh = [...store.feed()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const followed = store.get().followedTopics;

  return {
    layout: 'app',
    title: 'Discover — Research',
    html: `
      <div class="page fade-in">
        <header class="page-head">
          <h1 class="h1">Discover</h1>
          <p class="lead">Material that isn't in your library yet, ranked against what you already know.</p>
        </header>

        <section class="section">
          ${sectionHead('For you', '<span class="xs muted-2">Ranked by personal relevance</span>')}
          ${forYou.length ? `<div class="grid grid-auto">${forYou.map(a => articleCard(a)).join('')}</div>`
            : emptyState({
                title: 'You are caught up',
                body: 'Everything currently relevant has been read. New material arrives as your sources are checked.',
                cta: 'Add a source', act: 'add:open', arg: 'website',
              })}
        </section>

        <section class="section">
          ${sectionHead('Trending in your topics')}
          <div class="grid grid-auto">${trending.map(a => articleCard(a, { showReasons: false })).join('')}</div>
        </section>

        <section class="section">
          ${sectionHead('New from your sources',
            `<button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/sources">Manage sources ${icon('right', 13)}</button>`)}
          <div class="rows">${fresh.map(articleRow).join('')}</div>
        </section>

        <section class="section">
          ${sectionHead('Explore topics')}
          <div class="grid grid-auto">
            ${TOPICS.map(t => `
              <div class="card card-hover card-tight">
                <div class="row between">
                  <button class="link" data-act="nav:go" data-id="/topics/${t.id}" style="font-family:var(--font-serif);font-size:1.0625rem">${esc(t.name)}</button>
                  <span class="${t.momentum >= 0 ? 'trend-up' : 'muted small'}">${t.momentum >= 0 ? '+' : ''}${t.momentum}%</span>
                </div>
                <p class="xs muted mt-2">${t.articles} articles · ${t.sources} sources</p>
                <button class="btn btn-sm mt-4" data-act="topic:follow" data-id="${t.id}">
                  ${followed.includes(t.id) ? `${icon('check', 13)} Following` : 'Follow topic'}
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
    title: 'Library — Research',
    html: `
      <div class="page fade-in">
        <header class="page-head">
          <h1 class="h1">Library</h1>
          <p class="lead">Everything you have collected, read or imported.</p>
        </header>

        ${tabBar([
          { id: 'all', label: 'All', count: byTab.all.length },
          { id: 'saved', label: 'Saved', count: byTab.saved.length },
          { id: 'read', label: 'Read', count: byTab.read.length },
          { id: 'unread', label: 'Unread', count: byTab.unread.length },
          { id: 'imported', label: 'Imported', count: byTab.imported.length },
        ], lib.tab, 'lib:tab')}

        <div class="row wrap gap-2" style="margin-bottom:var(--s-5)">
          <div class="grow" style="min-width:220px;position:relative">
            <input class="input" id="libSearch" placeholder="Search your research…" value="${esc(lib.q)}"
              data-act-enter="lib:search" autocomplete="off">
          </div>
          <select class="select" style="width:auto" data-act="lib:topic" id="libTopic">
            <option value="">All topics</option>
            ${TOPICS.map(t => `<option value="${t.id}" ${lib.topic === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
          <select class="select" style="width:auto" data-act="lib:source" id="libSource">
            <option value="">All sources</option>
            ${sources.map(s => `<option value="${s.id}" ${lib.source === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
          </select>
          <select class="select" style="width:auto" data-act="lib:sort" id="libSort">
            <option value="newest" ${lib.sort === 'newest' ? 'selected' : ''}>Newest</option>
            <option value="relevance" ${lib.sort === 'relevance' ? 'selected' : ''}>Most relevant</option>
            <option value="recent" ${lib.sort === 'recent' ? 'selected' : ''}>Recently read</option>
          </select>
          ${(lib.q || lib.topic || lib.source) ? '<button class="btn btn-sm btn-ghost" data-act="lib:clear">Clear</button>' : ''}
        </div>

        ${list.length ? `
          <p class="xs muted-2" style="margin-bottom:var(--s-2)">${list.length} ${list.length === 1 ? 'item' : 'items'}</p>
          <div class="rows">${list.map(articleRow).join('')}</div>`
          : emptyState({
              title: 'Your research library is waiting.',
              body: 'Add an article or a website and we will start building your personal knowledge base.',
              cta: 'Add your first source', act: 'add:open', arg: 'article',
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
