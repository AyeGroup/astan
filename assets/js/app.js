/* ==========================================================================
   Application shell: global layout, navigation, search, global actions.
   ========================================================================== */
import { esc, icon, on, toast, num, initDelegation, openModal, closeModal, qs } from './ui.js';
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
import { translate, registerTranslateActions, resetTranslate } from './views/translate.js';

const NAV = [
  { path: '/home',     label: 'خانه',      icon: 'home',    mobile: true },
  { path: '/discover', label: 'پیشنهادها', icon: 'compass', mobile: true },
  { path: '/library',  label: 'کتابخانه',  icon: 'book',    mobile: true },
  { path: '/translate', label: 'مترجم',    icon: 'globe',   mobile: true },
  { path: '/topics',   label: 'موضوع‌ها',  icon: 'hash' },
  { path: '/sources',  label: 'منبع‌ها',   icon: 'layers' },
  { path: '/research', label: 'پرسیدن',    icon: 'search' },
];

const app = document.getElementById('app');
let currentView = null;

/* ------------------------------------------------------------------ Shell */
function topbar(active) {
  const s = store.get();
  const unread = store.notifications().filter(n => n.unread).length;
  return `
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="#/home">
          <span class="brand-mark">پ</span>
          <span class="brand-name">پژوهش</span>
        </a>

        <nav class="nav">
          ${NAV.map(n => `
            <a class="nav-item" href="#${n.path}" ${active === n.path ? 'aria-current="page"' : ''}>
              ${icon(n.icon, 15)} <span>${n.label}</span>
            </a>`).join('')}
        </nav>

        <span class="grow"></span>

        <button class="bar-search" data-act="palette:open">
          ${icon('search', 14)}
          <span>جست‌وجو</span>
          <span class="kbd">⌘K</span>
        </button>

        <button class="btn btn-sm btn-primary" data-act="add:menu">${icon('plus', 14)} افزودن</button>

        <a class="btn btn-ghost btn-icon btn-sm" href="#/notifications" aria-label="اعلان‌ها" style="position:relative">
          ${icon('bell', 16)}
          ${unread ? `<span class="bar-count">${num(unread)}</span>` : ''}
        </a>
        <button class="btn btn-ghost btn-icon btn-sm" data-act="theme:toggle" aria-label="تغییر بین حالت روشن و تاریک">
          ${icon(store.resolvedTheme() === 'dark' ? 'sun' : 'moon', 16)}
        </button>
        <button class="avatar" data-act="nav:go" data-id="/settings" aria-label="تنظیمات">
          ${esc((s.account?.name || 'م').slice(0, 1))}
        </button>
      </div>
    </header>`;
}

function mobileNav(active) {
  const items = [...NAV.filter(n => n.mobile), { path: '/settings', label: 'شما', icon: 'user' }];
  return `
    <nav class="mobile-nav">
      ${items.map(n => `
        <a href="#${n.path}" ${active === n.path ? 'aria-current="page"' : ''}>
          ${icon(n.icon, 18)}<span>${n.label}</span>
        </a>`).join('')}
    </nav>
    <button class="fab" data-act="add:menu" aria-label="افزودن">${icon('plus', 20)}</button>`;
}

function render(view) {
  currentView = view;
  document.title = view.title || 'پژوهش';
  document.body.dataset.route = currentRoute().segments[0] || 'landing';
  if (view.layout === 'bare') {
    app.innerHTML = view.html;
    return;
  }
  const active = '/' + (currentRoute().segments[0] || '');
  app.innerHTML = `
    ${topbar(active)}
    <main>${view.html}</main>
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
  translate: requireAccount(() => render(translate())),
  notifications: requireAccount(() => render(notifications())),
  settings: requireAccount(() => render(settings())),
  __notfound: () => render({
    layout: 'app', title: 'پیدا نشد',
    html: `<div class="page"><h1 class="h1">این صفحه وجود ندارد</h1>
      <p class="muted mt-3">شاید نشانی را اشتباه وارد کرده‌اید یا این صفحه حذف شده است.</p>
      <button class="btn btn-primary mt-5" data-act="nav:go" data-id="/home">برگردید به خانه</button></div>`,
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
  if (seg !== 'translate') resetTranslate();
});

/* ---------------------------------------------------------- Global actions */
on('nav:go', ({ id }) => go(id));
on('nav:back', () => (history.length > 1 ? history.back() : go('/home')));
on('theme:toggle', () => { store.toggleTheme(); rerender(); });
on('help', () => openModal({
  title: 'پژوهش چه کار می‌کند؟',
  body: `
    <div class="col gap-6">
      <div>
        <span class="label">کار اصلی</span>
        <p class="mt-2">شما موضوع‌های مورد علاقه‌تان را انتخاب می‌کنید و سایت‌هایی را که
          دنبال می‌کنید به ما معرفی می‌کنید. ما هر روز مقاله‌های تازه آن‌ها را می‌خوانیم
          و مهم‌ترین‌ها را برایتان خلاصه می‌کنیم.</p>
      </div>
      <div>
        <span class="label">هر پیشنهاد دلیل دارد</span>
        <p class="mt-2">کنار هر مقاله می‌نویسیم چرا آن را برای شما انتخاب کرده‌ایم.
          اگر انتخاب خوبی نبود، با یک کلیک به ما بگویید تا پیشنهادهای بعدی دقیق‌تر شود.</p>
      </div>
      <div>
        <span class="label">وقتی جواب را نداریم</span>
        <p class="mt-2">اگر در مقاله‌های شما جواب روشنی نباشد، صریح می‌گوییم که نمی‌دانیم.
          هیچ‌وقت از خودمان جواب نمی‌سازیم.</p>
      </div>
      <div>
        <span class="label">میان‌برها</span>
        <p class="mt-3"><span class="kbd">⌘K</span> برای جست‌وجو · <span class="kbd">Esc</span> برای بستن</p>
      </div>
    </div>`,
}));

/* --- Article actions ----------------------------------------------------- */
on('article:open', ({ id }) => { resetReader(); go(`/article/${id}`); });

on('article:save', ({ id }) => {
  const saved = store.toggleSave(id);
  toast(saved ? 'در کتابخانه شما ذخیره شد' : 'از کتابخانه شما برداشته شد');
  rerender();
});

on('article:dismiss', ({ id }) => {
  store.dismiss(id);
  toast('باشد، دیگر از این‌جور مقاله‌ها کمتر نشان می‌دهیم');
  rerender();
});

on('article:share', ({ id }) => {
  const a = store.findArticle(id);
  const text = `${a.title} — ${location.origin}${location.pathname}#/article/${id}`;
  if (navigator.share) navigator.share({ title: a.title, text }).catch(() => {});
  else if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
      .then(() => toast('لینک مقاله کپی شد'))
      .catch(() => toast('مرورگر اجازه کپی‌کردن نداد', 'x'));
  } else toast('این مرورگر امکان هم‌رسانی ندارد', 'x');
});

/* §26 "Why this?" + §27 feedback, in one place. */
on('article:why', ({ id }) => {
  const a = store.findArticle(id);
  if (!a) return;
  const weight = store.get().topicWeights[a.topic] ?? 50;
  openModal({
    title: 'چرا این مقاله را انتخاب کردیم',
    subtitle: `${esc(topicName(a.topic))} · ٪${num(store.personalRelevance(a))} مرتبط`,
    body: `
      <p class="h2" style="line-height:1.6">${esc(a.title)}</p>
      <ul class="mt-5" style="display:grid;gap:var(--s-3)">
        ${a.reasons.map(r => `<li class="row gap-3"><span class="dot dot-ok"></span><span>${esc(r)}</span></li>`).join('')}
        <li class="row gap-3"><span class="dot dot-ok"></span><span>علاقه شما به این موضوع ${num(weight)} از ۱۰۰ است</span></li>
        <li class="row gap-3"><span class="dot dot-ok"></span><span>این مقاله از <span class="latin">${esc(sourceName(a.source))}</span> است که دنبالش می‌کنید</span></li>
      </ul>
      <div class="divider mt-5"></div>
      <div class="mt-5">
        <span class="label">این انتخاب ما خوب بود؟</span>
        <div class="row wrap gap-2 mt-3">
          <button class="btn btn-sm btn-primary" data-act="fb:up" data-id="${a.id}">${icon('thumbUp', 14)} بله</button>
          <button class="btn btn-sm" data-act="fb:down" data-id="${a.id}">${icon('thumbDn', 14)} نه</button>
          <button class="btn btn-sm btn-ghost" data-act="fb:more" data-id="${a.id}">از این‌ها بیشتر</button>
          <button class="btn btn-sm btn-ghost" data-act="fb:less" data-id="${a.id}">از این‌ها کمتر</button>
          <button class="btn btn-sm btn-ghost" data-act="fb:hide" data-id="${a.source}">دیگر از این منبع نشان نده</button>
        </div>
        <p class="xs muted-2 mt-4">جواب شما را همین حالا اعمال می‌کنیم. دفعه بعد که سر بزنید، فرقش را می‌بینید.</p>
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

on('fb:up',   ({ id }) => feedback('save', id, 'ممنون. از این‌جور مقاله‌ها بیشتر نشان می‌دهیم.'));
on('fb:down', ({ id }) => feedback('notInterested', id, 'ممنون. از این‌جور مقاله‌ها کمتر نشان می‌دهیم.'));
on('fb:more', ({ id }) => feedback('followTopic', id, 'از این موضوع بیشتر برایتان می‌آوریم.'));
on('fb:less', ({ id }) => feedback('skip', id, 'از این موضوع کمتر برایتان می‌آوریم.'));
on('fb:hide', ({ id }) => {
  store.hideSource(id);
  closeModal();
  toast(`دیگر از ${sourceName(id)} مقاله‌ای نشان نمی‌دهیم.`);
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
    <input class="palette-input" id="paletteInput" placeholder="دنبال چه چیزی می‌گردید؟"
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
      <div class="palette-group">این سؤال را از کتابخانه‌تان بپرسید</div>
      <button class="palette-item" data-act="palette:ask" data-q="${esc(query)}">
        <span class="palette-ico">${icon('spark', 15)}</span>
        <span class="grow"><b class="small">${esc(query)}</b>
          <span class="xs muted" style="display:block">جواب را از روی همه مقاله‌های شما می‌نویسیم</span></span>
      </button>` : ''}

    <div class="palette-group">${query ? 'در کتابخانه شما' : 'پیشنهاد برای شما'}</div>
    ${articles.length ? articles.map(a => `
      <button class="palette-item" data-act="palette:article" data-id="${a.id}">
        <span class="palette-ico">${icon('file', 15)}</span>
        <span class="grow"><b class="small clamp-1">${esc(a.title)}</b>
          <span class="xs muted">${esc(sourceName(a.source))} · ${esc(topicName(a.topic))}</span></span>
      </button>`).join('')
      : '<p class="small muted" style="padding:var(--s-4)">مقاله‌ای با این عبارت پیدا نشد. می‌توانید سؤالتان را مستقیم از کتابخانه بپرسید.</p>'}

    ${topics.length ? `
      <div class="palette-group">موضوع‌ها</div>
      ${topics.map(t => `
        <button class="palette-item" data-act="palette:topic" data-id="${t.id}">
          <span class="palette-ico">${icon('hash', 15)}</span> <span class="small">${esc(t.name)}</span>
        </button>`).join('')}` : ''}

    ${query ? `
      <div class="palette-group">جست‌وجو در متن</div>
      <button class="palette-item" data-act="palette:library" data-q="${esc(query)}">
        <span class="palette-ico">${icon('book', 15)}</span> <span class="small">دیدن همه نتیجه‌ها در کتابخانه</span>
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
registerTranslateActions(rerender);

store.applyTheme();
store.touchVisit();
start();
