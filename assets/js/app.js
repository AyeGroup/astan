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

const NAV = [
  { path: '/home',          label: 'خانه',     icon: 'home',     mobile: true },
  { path: '/discover',      label: 'کشف',      icon: 'compass',  mobile: true },
  { path: '/library',       label: 'کتابخانه', icon: 'book',     mobile: true },
  { path: '/topics',        label: 'موضوع‌ها', icon: 'hash',     mobile: true },
  { path: '/sources',       label: 'منابع',    icon: 'layers' },
  { path: '/research',      label: 'پژوهش عمیق', icon: 'search' },
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
        <span class="brand-mark">پ</span>
        <span class="brand-name">پژوهش</span>
      </a>

      <button class="btn btn-primary btn-block" data-act="add:menu">${icon('plus', 14)} افزودن</button>

      <nav class="nav mt-5">
        ${NAV.map(n => `
          <a class="nav-item" href="#${n.path}" ${active === n.path ? 'aria-current="page"' : ''}>
            ${icon(n.icon)} <span>${n.label}</span>
          </a>`).join('')}
        <a class="nav-item" href="#/notifications" ${active === '/notifications' ? 'aria-current="page"' : ''}>
          ${icon('bell')} <span>اعلان‌ها</span>
          ${unread ? `<span class="nav-count">${num(unread)}</span>` : ''}
        </a>
      </nav>

      <div class="nav mt-6">
        <span class="eyebrow nav-label">موضوع‌های شما</span>
        ${store.rankedTopics().slice(0, 4).map(t => `
          <a class="nav-item small" href="#/topics/${t.id}">
            <i class="dot ${store.get().followedTopics.includes(t.id) ? 'dot-live' : ''}"></i>
            <span class="clamp-1">${esc(t.name)}</span>
          </a>`).join('')}
      </div>

      <div class="sidebar-foot">
        <a class="nav-item" href="#/settings" ${active === '/settings' ? 'aria-current="page"' : ''}>
          ${icon('settings')} <span>تنظیمات</span>
        </a>
        <button class="nav-item" data-act="help">${icon('help')} <span>راهنما</span></button>
        <button class="user-chip mt-2" data-act="nav:go" data-id="/settings">
          <span class="avatar">${esc((s.account?.name || 'G').slice(0, 1).toUpperCase())}</span>
          <span class="grow" style="min-width:0">
            <span class="small clamp-1" style="display:block">${esc(s.account?.name || 'مهمان')}</span>
            <span class="xs muted-2 clamp-1 latin" style="display:block">${esc(s.account?.email || '—')}</span>
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
        <span>جست‌وجو یا پرسش از پژوهش شما…</span>
        <span class="kbd">⌘K</span>
      </button>
      <span class="grow"></span>
      <button class="btn btn-ghost btn-icon" data-act="theme:toggle" aria-label="تغییر پوسته">
        ${icon(store.resolvedTheme() === 'dark' ? 'sun' : 'moon')}
      </button>
      <a class="btn btn-ghost btn-icon" href="#/notifications" aria-label="اعلان‌ها" style="position:relative">
        ${icon('bell')}
        ${unread ? '<i class="dot dot-live" style="position:absolute;top:7px;right:7px"></i>' : ''}
      </a>
    </header>`;
}

function mobileNav(active) {
  const items = [...NAV.filter(n => n.mobile), { path: '/settings', label: 'نمایه', icon: 'user' }];
  return `
    <nav class="mobile-nav">
      ${items.map(n => `
        <a href="#${n.path}" ${active === n.path ? 'aria-current="page"' : ''}>
          ${icon(n.icon, 18)}<span>${n.label}</span>
        </a>`).join('')}
    </nav>
    <button class="fab" data-act="add:menu" aria-label="افزودن منبع">${icon('plus', 20)}</button>`;
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
    layout: 'app', title: 'پیدا نشد',
    html: `<div class="page"><h1 class="h1">صفحه پیدا نشد</h1>
      <p class="lead mt-3">چنین نشانی‌ای وجود ندارد.</p>
      <button class="btn btn-primary mt-5" data-act="nav:go" data-id="/home">بازگشت به خانه</button></div>`,
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
  title: 'پژوهش چطور کار می‌کند',
  body: `
    <div class="col gap-5">
      <div>
        <span class="eyebrow">ایده اصلی</span>
        <p class="mt-2">شما نباید مجبور باشید دنبال دانش بگردید. پژوهش را به منابع و موضوع‌هایی
          که برایتان مهم‌اند وصل کنید تا مطالب مرتبط خودشان سراغتان بیایند — خلاصه‌شده،
          توضیح‌داده‌شده و پیوندخورده با آنچه از پیش می‌دانید.</p>
      </div>
      <div>
        <span class="eyebrow">هر پیشنهاد دلیل خودش را می‌گوید</span>
        <p class="mt-2">هر کارتی که دکمه «چرا این؟» دارد دقیقاً می‌گوید کدام سیگنال‌ها آن را
          جلوی چشم شما گذاشته‌اند، و همان‌جا می‌توانید اصلاحش کنید.</p>
      </div>
      <div>
        <span class="eyebrow">وقتی نمی‌دانیم</span>
        <p class="mt-2">اگر منابع مطمئن نباشند یا کتابخانه شما کم‌مایه باشد، محصول همین را می‌گوید.
          شکاف را با زبان قاطع پر نمی‌کند.</p>
      </div>
      <div>
        <span class="eyebrow">میان‌برها</span>
        <p class="mt-2"><span class="kbd">⌘K</span> جست‌وجو یا پرسش · <span class="kbd">Esc</span> بستن</p>
      </div>
    </div>`,
}));

/* --- Article actions ----------------------------------------------------- */
on('article:open', ({ id }) => { resetReader(); go(`/article/${id}`); });

on('article:save', ({ id }) => {
  const saved = store.toggleSave(id);
  toast(saved ? 'در کتابخانه شما ذخیره شد' : 'از ذخیره‌ها حذف شد');
  rerender();
});

on('article:dismiss', ({ id }) => {
  store.dismiss(id);
  toast('کمتر از این‌ها. فید شما تنظیم شد.');
  rerender();
});

on('article:share', ({ id }) => {
  const a = store.findArticle(id);
  const text = `${a.title} — ${location.origin}${location.pathname}#/article/${id}`;
  if (navigator.share) navigator.share({ title: a.title, text }).catch(() => {});
  else if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
      .then(() => toast('پیوند کپی شد'))
      .catch(() => toast('کپی‌کردن اینجا مسدود است', 'x'));
  } else toast('هم‌رسانی در این مرورگر در دسترس نیست', 'x');
});

/* §26 "Why this?" + §27 feedback, in one place. */
on('article:why', ({ id }) => {
  const a = store.findArticle(id);
  if (!a) return;
  const weight = store.get().topicWeights[a.topic] ?? 50;
  openModal({
    title: 'چرا این را می‌بینید',
    subtitle: `٪${num(store.personalRelevance(a))} مرتبط · ${esc(topicName(a.topic))}`,
    body: `
      <p class="h3" style="font-family:var(--font-serif);font-weight:400">${esc(a.title)}</p>
      <ul class="reasons mt-5">
        ${a.reasons.map(r => `<li>${esc(r)}</li>`).join('')}
        <li>وزن علاقه شما به «${esc(topicName(a.topic))}» برابر ${num(weight)} از ۱۰۰ است</li>
        <li>از ${esc(sourceName(a.source))}، منبعی که پایش می‌کنید</li>
      </ul>
      <div class="divider mt-5"></div>
      <div class="mt-5">
        <span class="eyebrow">این مفید بود؟</span>
        <div class="row wrap gap-2 mt-3">
          <button class="btn btn-sm" data-act="fb:up" data-id="${a.id}">${icon('thumbUp', 14)} مرتبط بود</button>
          <button class="btn btn-sm" data-act="fb:down" data-id="${a.id}">${icon('thumbDn', 14)} مرتبط نبود</button>
          <button class="btn btn-sm btn-ghost" data-act="fb:more" data-id="${a.id}">بیشتر از این‌ها</button>
          <button class="btn btn-sm btn-ghost" data-act="fb:less" data-id="${a.id}">کمتر از این‌ها</button>
          <button class="btn btn-sm btn-ghost" data-act="fb:hide" data-id="${a.source}">پنهان‌کردن ${esc(sourceName(a.source))}</button>
        </div>
        <p class="xs muted-2 mt-4">بازخورد شما مستقیم وارد پیشنهادها می‌شود — اثرش را در بازدید بعدی از خانه می‌بینید.</p>
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

on('fb:up',   ({ id }) => feedback('save', id, 'ثبت شد — بیشتر از این‌ها'));
on('fb:down', ({ id }) => feedback('notInterested', id, 'ثبت شد — کمتر از این‌ها'));
on('fb:more', ({ id }) => feedback('followTopic', id, 'بیشتر از این موضوع در فید شما'));
on('fb:less', ({ id }) => feedback('skip', id, 'کمتر از این موضوع در فید شما'));
on('fb:hide', ({ id }) => {
  store.hideSource(id);
  closeModal();
  toast(`${sourceName(id)} از فید شما پنهان شد`);
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
    <input class="palette-input" id="paletteInput" placeholder="در پژوهش خود بگردید، یا پرسشی بپرسید…"
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
      <div class="palette-group eyebrow">پرسش از پژوهش</div>
      <button class="palette-item" data-act="palette:ask" data-q="${esc(query)}">
        ${icon('spark', 14)}
        <span class="grow"><b class="small">${esc(query)}</b>
          <span class="xs muted" style="display:block">پاسخ از کل کتابخانه شما</span></span>
      </button>` : ''}

    <div class="palette-group eyebrow">${query ? 'در کتابخانه شما' : 'پیشنهاد برای شما'}</div>
    ${articles.length ? articles.map(a => `
      <button class="palette-item" data-act="palette:article" data-id="${a.id}">
        ${icon('file', 14)}
        <span class="grow"><b class="small clamp-1">${esc(a.title)}</b>
          <span class="xs muted">${esc(sourceName(a.source))} · ${esc(topicName(a.topic))}</span></span>
      </button>`).join('')
      : '<p class="small muted" style="padding:var(--s-3)">مقاله‌ای پیدا نشد. به‌جایش از «پژوهش» بپرسید.</p>'}

    ${topics.length ? `
      <div class="palette-group eyebrow">موضوع‌ها</div>
      ${topics.map(t => `
        <button class="palette-item" data-act="palette:topic" data-id="${t.id}">
          ${icon('hash', 14)} <span class="small">${esc(t.name)}</span>
        </button>`).join('')}` : ''}

    ${query ? `
      <div class="palette-group eyebrow">جست‌وجوی محتوا</div>
      <button class="palette-item" data-act="palette:library" data-q="${esc(query)}">
        ${icon('book', 14)} <span class="small">دیدن همه نتایج در کتابخانه</span>
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

store.applyTheme();
store.touchVisit();
start();
