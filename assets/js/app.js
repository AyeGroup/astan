/* ==========================================================================
   Application shell: global layout, navigation, search, global actions.
   ========================================================================== */
import { esc, icon, on, toast, initDelegation, openModal, closeModal, qs } from './ui.js';
import { route, setNotFound, start, go, currentRoute } from './router.js';
import * as store from './store.js';
import { TOPICS, topicName, sourceName } from './data.js';

import { landing, auth, onboarding, registerLandingActions } from './views/landing.js';
import { home } from './views/home.js';
import { discover, library, registerBrowseActions, librarySearch } from './views/browse.js';
import { topicsIndex, topicDetail, registerTopicActions, resetTopicTab } from './views/topics.js';
import { sourcesIndex, sourceDetail, registerSourceActions, resetSourceTab } from './views/sources.js';
import { reader, registerReaderActions, resetReader } from './views/reader.js';
import { research, registerResearchActions, resetResearch } from './views/research.js';
import { notifications, settings, registerMiscActions } from './views/misc.js';
import { registerAddActions } from './views/add.js';

const NAV = [
  { path: '/home',          label: 'Home',      icon: 'home',     mobile: true },
  { path: '/discover',      label: 'Discover',  icon: 'compass',  mobile: true },
  { path: '/library',       label: 'Library',   icon: 'book',     mobile: true },
  { path: '/topics',        label: 'Topics',    icon: 'hash',     mobile: true },
  { path: '/sources',       label: 'Sources',   icon: 'layers' },
  { path: '/research',      label: 'Research',  icon: 'search' },
];

const app = document.getElementById('app');
let currentView = null;

/* ------------------------------------------------------------------ Shell */
function sidebar(active) {
  const s = store.get();
  const unread = store.notifications().filter(n => n.unread).length;
  return `
    <aside class="sidebar">
      <a class="brand" href="#/home">
        <span class="brand-mark">R</span>
        <span class="brand-name">Research</span>
      </a>

      <button class="btn btn-primary btn-block" data-act="add:menu">${icon('plus', 14)} Add</button>

      <nav class="nav mt-5">
        ${NAV.map(n => `
          <a class="nav-item" href="#${n.path}" ${active === n.path ? 'aria-current="page"' : ''}>
            ${icon(n.icon)} <span>${n.label}</span>
          </a>`).join('')}
        <a class="nav-item" href="#/notifications" ${active === '/notifications' ? 'aria-current="page"' : ''}>
          ${icon('bell')} <span>Notifications</span>
          ${unread ? `<span class="nav-count">${unread}</span>` : ''}
        </a>
      </nav>

      <div class="nav mt-6">
        <span class="eyebrow nav-label">Your topics</span>
        ${store.rankedTopics().slice(0, 4).map(t => `
          <a class="nav-item small" href="#/topics/${t.id}">
            <i class="dot ${store.get().followedTopics.includes(t.id) ? 'dot-live' : ''}"></i>
            <span class="clamp-1">${esc(t.name)}</span>
          </a>`).join('')}
      </div>

      <div class="sidebar-foot">
        <a class="nav-item" href="#/settings" ${active === '/settings' ? 'aria-current="page"' : ''}>
          ${icon('settings')} <span>Settings</span>
        </a>
        <button class="nav-item" data-act="help">${icon('help')} <span>Help</span></button>
        <button class="user-chip mt-2" data-act="nav:go" data-id="/settings">
          <span class="avatar">${esc((s.account?.name || 'G').slice(0, 1).toUpperCase())}</span>
          <span class="grow" style="min-width:0">
            <span class="small clamp-1" style="display:block">${esc(s.account?.name || 'Guest')}</span>
            <span class="xs muted-2 clamp-1" style="display:block">${esc(s.account?.email || 'Not signed in')}</span>
          </span>
        </button>
      </div>
    </aside>`;
}

function topbar() {
  const unread = store.notifications().filter(n => n.unread).length;
  return `
    <header class="topbar">
      <button class="search-trigger" data-act="palette:open">
        ${icon('search', 14)}
        <span>Search or ask your research…</span>
        <span class="kbd">⌘K</span>
      </button>
      <span class="grow"></span>
      <button class="btn btn-ghost btn-icon" data-act="theme:toggle" aria-label="Toggle theme">
        ${icon(store.get().theme === 'dark' ? 'sun' : 'moon')}
      </button>
      <a class="btn btn-ghost btn-icon" href="#/notifications" aria-label="Notifications" style="position:relative">
        ${icon('bell')}
        ${unread ? '<i class="dot dot-live" style="position:absolute;top:7px;right:7px"></i>' : ''}
      </a>
    </header>`;
}

function mobileNav(active) {
  const items = [...NAV.filter(n => n.mobile), { path: '/settings', label: 'Profile', icon: 'user' }];
  return `
    <nav class="mobile-nav">
      ${items.map(n => `
        <a href="#${n.path}" ${active === n.path ? 'aria-current="page"' : ''}>
          ${icon(n.icon, 18)}<span>${n.label}</span>
        </a>`).join('')}
    </nav>
    <button class="fab" data-act="add:menu" aria-label="Add a source">${icon('plus', 20)}</button>`;
}

function render(view) {
  currentView = view;
  document.title = view.title || 'Research';
  document.body.dataset.route = currentRoute().segments[0] || 'landing';
  if (view.layout === 'bare') {
    app.innerHTML = view.html;
    return;
  }
  const active = '/' + (currentRoute().segments[0] || '');
  app.innerHTML = `
    <div class="shell">
      ${sidebar(active)}
      <div class="main">
        ${topbar()}
        ${view.html}
      </div>
    </div>
    ${mobileNav(active)}`;
}

/* Re-run the current route handler (used after state changes). */
function rerender() {
  const { segments } = currentRoute();
  const handler = handlers[segments[0] || ''] || handlers.__notfound;
  handler(segments.slice(1));
}

/* ----------------------------------------------------------------- Guards */
const requireAccount = fn => segments => {
  if (!store.get().account) { go('/', { replace: true }); return; }
  fn(segments);
};

/* ----------------------------------------------------------------- Routes */
const handlers = {
  '': () => render(store.get().account && store.get().onboarded ? home() : landing()),
  auth: () => render(auth()),
  onboarding: segments => render(onboarding(segments)),
  home: requireAccount(() => render(home())),
  discover: requireAccount(() => render(discover())),
  library: requireAccount(() => render(library())),
  topics: requireAccount(s => render(s.length ? topicDetail(s) : topicsIndex())),
  sources: requireAccount(s => render(s.length ? sourceDetail(s) : sourcesIndex())),
  article: requireAccount(s => render(reader(s))),
  research: requireAccount(() => render(research())),
  notifications: requireAccount(() => render(notifications())),
  settings: requireAccount(() => render(settings())),
  __notfound: () => render({
    layout: 'app', title: 'Not found',
    html: `<div class="page"><h1 class="h1">Page not found</h1>
      <p class="lead mt-3">That route doesn't exist.</p>
      <button class="btn btn-primary mt-5" data-act="nav:go" data-id="/home">Back to Home</button></div>`,
  }),
};

Object.entries(handlers).forEach(([name, fn]) => { if (name !== '__notfound') route(name, fn); });
setNotFound(handlers.__notfound);

/* Reset per-screen local state when leaving a screen. */
window.addEventListener('hashchange', () => {
  const seg = location.hash.replace(/^#\//, '').split('/')[0];
  if (seg !== 'article') resetReader();
  if (seg !== 'topics') resetTopicTab();
  if (seg !== 'sources') resetSourceTab();
  if (seg !== 'research') resetResearch();
});

/* ---------------------------------------------------------- Global actions */
on('nav:go', ({ id }) => go(id));
on('nav:back', () => (history.length > 1 ? history.back() : go('/home')));
on('theme:toggle', () => { store.toggleTheme(); rerender(); });
on('help', () => openModal({
  title: 'How Research works',
  body: `
    <div class="col gap-5">
      <div>
        <span class="eyebrow">The idea</span>
        <p class="mt-2">You should not have to search for knowledge. Point Research at the
          sources and subjects you care about, and relevant material comes to you — summarised,
          explained, and connected to what you already know.</p>
      </div>
      <div>
        <span class="eyebrow">Every recommendation explains itself</span>
        <p class="mt-2">Any card with a "Why this?" button will tell you exactly which signals
          put it in front of you, and you can correct it on the spot.</p>
      </div>
      <div>
        <span class="eyebrow">When we don't know</span>
        <p class="mt-2">If the sources are uncertain or your library is thin, the product says so.
          It does not fill the gap with confident language.</p>
      </div>
      <div>
        <span class="eyebrow">Shortcuts</span>
        <p class="mt-2"><span class="kbd">⌘K</span> search or ask · <span class="kbd">Esc</span> close</p>
      </div>
    </div>`,
}));

/* --- Article actions ----------------------------------------------------- */
on('article:open', ({ id }) => { resetReader(); go(`/article/${id}`); });

on('article:save', ({ id }) => {
  const saved = store.toggleSave(id);
  toast(saved ? 'Saved to your library' : 'Removed from saved');
  rerender();
});

on('article:dismiss', ({ id }) => {
  store.dismiss(id);
  toast('Fewer like this. Your feed has been adjusted.');
  rerender();
});

on('article:share', ({ id }) => {
  const a = store.findArticle(id);
  const text = `${a.title} — ${location.origin}${location.pathname}#/article/${id}`;
  if (navigator.share) navigator.share({ title: a.title, text }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Link copied'));
  else toast('Sharing is unavailable in this browser', 'x');
});

/* §26 "Why this?" + §27 feedback, in one place. */
on('article:why', ({ id }) => {
  const a = store.findArticle(id);
  if (!a) return;
  const weight = store.get().topicWeights[a.topic] ?? 50;
  openModal({
    title: 'Why you are seeing this',
    subtitle: `${store.personalRelevance(a)}% relevant · ${esc(topicName(a.topic))}`,
    body: `
      <p class="h3" style="font-family:var(--font-serif);font-weight:400">${esc(a.title)}</p>
      <ul class="reasons mt-5">
        ${a.reasons.map(r => `<li>${esc(r)}</li>`).join('')}
        <li>Your interest weight for ${esc(topicName(a.topic))} is ${weight} of 100</li>
        <li>From ${esc(sourceName(a.source))}, a source you monitor</li>
      </ul>
      <div class="divider mt-5"></div>
      <div class="mt-5">
        <span class="eyebrow">Is this useful?</span>
        <div class="row wrap gap-2 mt-3">
          <button class="btn btn-sm" data-act="fb:up" data-id="${a.id}">${icon('thumbUp', 14)} Relevant</button>
          <button class="btn btn-sm" data-act="fb:down" data-id="${a.id}">${icon('thumbDn', 14)} Not relevant</button>
          <button class="btn btn-sm btn-ghost" data-act="fb:more" data-id="${a.id}">More like this</button>
          <button class="btn btn-sm btn-ghost" data-act="fb:less" data-id="${a.id}">Less like this</button>
          <button class="btn btn-sm btn-ghost" data-act="fb:hide" data-id="${a.source}">Hide ${esc(sourceName(a.source))}</button>
        </div>
        <p class="xs muted-2 mt-4">Feedback goes straight into your recommendations — you'll see the effect on your next visit to Home.</p>
      </div>`,
  });
});

const feedback = (kind, id, message) => {
  const a = store.findArticle(id);
  store.signal(kind, { topicId: a?.topic, sourceId: a?.source, label: a?.title });
  closeModal();
  toast(message);
  rerender();
};

on('fb:up',   ({ id }) => feedback('save', id, 'Noted — more like this'));
on('fb:down', ({ id }) => feedback('notInterested', id, 'Noted — fewer like this'));
on('fb:more', ({ id }) => feedback('followTopic', id, 'More of this topic in your feed'));
on('fb:less', ({ id }) => feedback('skip', id, 'Less of this topic in your feed'));
on('fb:hide', ({ id }) => {
  store.hideSource(id);
  closeModal();
  toast(`${sourceName(id)} hidden from your feed`);
  rerender();
});

/* --- §43 Search: two modes ------------------------------------------------ */
on('palette:open', () => {
  openModal({
    title: '', dismissible: true,
    body: '',
  });
  const overlay = qs('.overlay');
  const modal = qs('.modal', overlay);
  modal.classList.add('palette');
  modal.innerHTML = `
    <input class="palette-input" id="paletteInput" placeholder="Search your research, or ask a question…"
      autocomplete="off" data-act-enter="palette:search">
    <div class="palette-results" id="paletteResults"></div>`;
  const input = qs('#paletteInput', modal);
  input.addEventListener('input', () => paletteRender(input.value));
  paletteRender('');
  setTimeout(() => input.focus(), 40);
});

function paletteRender(q) {
  const out = document.getElementById('paletteResults');
  if (!out) return;
  const query = q.trim();
  const lower = query.toLowerCase();
  const articles = query
    ? store.allArticles().filter(a => `${a.title} ${a.summary} ${a.author}`.toLowerCase().includes(lower)).slice(0, 5)
    : store.feed().slice(0, 4);
  const topics = query ? TOPICS.filter(t => t.name.toLowerCase().includes(lower)).slice(0, 3) : [];

  out.innerHTML = `
    ${query ? `
      <div class="palette-group eyebrow">Ask Research</div>
      <button class="palette-item" data-act="palette:ask" data-q="${esc(query)}">
        ${icon('spark', 14)}
        <span class="grow"><b class="small">${esc(query)}</b>
          <span class="xs muted" style="display:block">Answer this from your whole library</span></span>
      </button>` : ''}

    <div class="palette-group eyebrow">${query ? 'In your library' : 'Suggested for you'}</div>
    ${articles.length ? articles.map(a => `
      <button class="palette-item" data-act="palette:article" data-id="${a.id}">
        ${icon('file', 14)}
        <span class="grow"><b class="small clamp-1">${esc(a.title)}</b>
          <span class="xs muted">${esc(sourceName(a.source))} · ${esc(topicName(a.topic))}</span></span>
      </button>`).join('')
      : '<p class="small muted" style="padding:var(--s-3)">No articles match. Try asking Research instead.</p>'}

    ${topics.length ? `
      <div class="palette-group eyebrow">Topics</div>
      ${topics.map(t => `
        <button class="palette-item" data-act="palette:topic" data-id="${t.id}">
          ${icon('hash', 14)} <span class="small">${esc(t.name)}</span>
        </button>`).join('')}` : ''}

    ${query ? `
      <div class="palette-group eyebrow">Search content</div>
      <button class="palette-item" data-act="palette:library" data-q="${esc(query)}">
        ${icon('book', 14)} <span class="small">See all matches in Library</span>
      </button>` : ''}`;
}

on('palette:article', ({ id }) => { closeModal(); go(`/article/${id}`); });
on('palette:topic', ({ id }) => { closeModal(); go(`/topics/${id}`); });
on('palette:library', ({ q }) => { closeModal(); librarySearch(q); go('/library'); rerender(); });
on('palette:ask', ({ q }) => {
  closeModal();
  go('/research');
  setTimeout(() => {
    const input = document.getElementById('researchInput');
    if (input) { input.value = q; }
    document.querySelector('[data-act="research:run"]')?.click();
  }, 80);
});
on('palette:search', () => {
  const q = (document.getElementById('paletteInput')?.value || '').trim();
  if (!q) return;
  const first = document.querySelector('#paletteResults .palette-item');
  first?.click();
});

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (store.get().account) document.querySelector('[data-act="palette:open"]')?.click();
  }
});

/* ------------------------------------------------------------------- Boot */
initDelegation();
registerLandingActions(rerender);
registerBrowseActions(rerender);
registerTopicActions(rerender);
registerSourceActions(rerender);
registerReaderActions(rerender);
registerResearchActions(rerender);
registerMiscActions(rerender);
registerAddActions(rerender);

store.applyTheme(store.get().theme);
store.touchVisit();
start();
