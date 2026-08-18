/* §23 Sources · §24 Source detail */
import { esc, icon, on, toast, num } from '../ui.js';
import { topicName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, articleRow, statBlock, tabBar, emptyState } from './components.js';

export function sourcesIndex() {
  const sources = store.allSources();
  const st = store.get().sourceState;

  return {
    layout: 'app',
    title: 'منابع — پژوهش',
    html: `
      <div class="page fade-in">
        <header class="page-head">
          <div class="row between wrap gap-4">
            <div>
              <h1 class="h1">منابع</h1>
              <p class="lead">سایت‌ها و سندهایی که به‌جای شما پایش می‌شوند.</p>
            </div>
            <button class="btn btn-primary" data-act="add:open" data-kind="website">${icon('plus', 14)} افزودن منبع</button>
          </div>
        </header>

        ${sources.length ? `
          <div class="grid grid-auto">
            ${sources.map(s => {
              const cfg = st[s.id] || {};
              const paused = cfg.status === 'paused';
              return `
                <div class="card card-hover">
                  <div class="row between">
                    <div class="row gap-2">
                      <i class="dot ${paused ? 'dot-warn' : 'dot-live'}"></i>
                      <span class="xs muted">${paused ? 'متوقف' : 'در حال پایش'} · ${esc(cfg.frequency || s.frequency)}</span>
                    </div>
                    <button class="btn btn-ghost btn-icon btn-sm" data-act="source:menu" data-id="${s.id}" aria-label="اقدامات منبع">${icon('more', 14)}</button>
                  </div>

                  <h2 class="h2 mt-4" style="cursor:pointer" data-act="nav:go" data-id="/sources/${s.id}">${esc(s.name)}</h2>
                  <p class="xs muted-2 latin">${esc(s.domain)}</p>

                  <div class="row gap-5 mt-5">
                    ${statBlock('مرتبط', num(s.relevant))}
                    ${statBlock('تازه این هفته', num(s.newThisWeek))}
                  </div>

                  <div class="row wrap gap-2 mt-4">
                    ${(s.topics || []).map(t => `<span class="badge badge-topic">${esc(topicName(t))}</span>`).join('')}
                  </div>

                  <div class="row between mt-5" style="padding-top:var(--s-3);border-top:1px solid var(--line)">
                    <span class="xs muted-2">آخرین بررسی ${esc(s.lastChecked)}</span>
                    <button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/sources/${s.id}">باز کردن ${icon('left', 13)}</button>
                  </div>
                </div>`;
            }).join('')}
          </div>`
          : emptyState({
              title: 'هنوز منبعی نیست.',
              body: 'یک سایت به ما نشان دهید تا ساختارش را نقشه‌برداری کنیم، مقاله‌های هم‌خوان با موضوع‌های شما را پیدا کنیم و پایشش را ادامه دهیم.',
              cta: 'افزودن نخستین منبع', act: 'add:open', arg: 'website',
            })}
      </div>`,
  };
}

const state = { tab: 'articles' };

export function sourceDetail(segments) {
  const s = store.findSource(segments[0]);
  if (!s) {
    return {
      layout: 'app', title: 'منبع پیدا نشد',
      html: `<div class="page">${emptyState({
        title: 'منبع پیدا نشد', body: 'این منبع در فضای کاری شما نیست.',
        cta: 'بازگشت به منابع', act: 'nav:go', arg: '/sources',
      })}</div>`,
    };
  }

  const cfg = store.get().sourceState[s.id] || {};
  const paused = cfg.status === 'paused';
  const articles = store.feed().filter(a => a.source === s.id);

  const panes = {
    articles: articles.length
      ? `<div class="rows">${articles.map(articleRow).join('')}</div>`
      : '<p class="muted small">هنوز مقاله‌ای از این منبع جمع‌آوری نشده است.</p>',
    topics: `
      <div class="grid grid-auto">
        ${(s.categories || []).map(c => `
          <div class="card card-tight">
            <div class="row between">
              <b>${esc(c.name)}</b>
              <span class="tnum small muted">${num(c.count)}</span>
            </div>
            <label class="checkbox mt-3">
              <input type="checkbox" data-act="source:track" data-id="${s.id}" data-cat="${esc(c.name)}"
                ${(cfg.tracked || []).includes(c.name) ? 'checked' : ''}>
              <span class="small">پایش این دسته</span>
            </label>
          </div>`).join('')}
      </div>`,
    activity: `
      <div class="rows">
        ${[
          ['بررسی مقاله‌های تازه', s.lastChecked, `${num(s.newThisWeek)} مورد تازه این هفته`],
          ['اعمال فیلتر ارتباط', 'دیروز', `${num(s.total - s.relevant)} مورد به‌دلیل ارتباط پایین کنار گذاشته شد`],
          ['نقشه‌برداری دوباره ساختار', '۳ روز پیش', `${num((s.categories || []).length)} دسته شناسایی شد`],
          ['آغاز پایش', '۳ هفته پیش', `زمان‌بندی ${esc(cfg.frequency || s.frequency)}`],
        ].map(([t, when, note]) => `
          <div class="list-row" style="cursor:default">
            <div class="grow">
              <p>${esc(t)}</p>
              <p class="xs muted-2 mt-2">${esc(note)}</p>
            </div>
            <span class="xs muted-2">${esc(when)}</span>
          </div>`).join('')}
      </div>`,
    settings: `
      <div style="max-width:520px">
        <div class="settings-row">
          <div>
            <b>پایش</b>
            <p class="xs muted mt-2">${paused ? 'متوقف — چیزی جمع‌آوری نمی‌شود.' : 'فعال — مقاله‌های تازه جمع‌آوری و امتیازدهی می‌شوند.'}</p>
          </div>
          <button class="switch" role="switch" aria-checked="${!paused}" data-act="source:pause" data-id="${s.id}"></button>
        </div>
        <div class="settings-row">
          <div>
            <b>دوره به‌روزرسانی</b>
            <p class="xs muted mt-2">هر چند وقت این منبع را دوباره بررسی کنیم.</p>
          </div>
          <select class="select" style="width:auto" data-source-freq="${s.id}">
            ${['روزانه', 'هر ۶ ساعت', 'هفتگی', 'دستی'].map(f =>
              `<option ${((cfg.frequency || s.frequency) === f) ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="settings-row">
          <div>
            <b>حذف منبع</b>
            <p class="xs muted mt-2">مقاله‌های جمع‌آوری‌شده در کتابخانه شما می‌مانند.</p>
          </div>
          <button class="btn btn-sm" data-act="source:remove" data-id="${s.id}">${icon('trash', 14)} حذف</button>
        </div>
      </div>`,
  };

  return {
    layout: 'app',
    title: `${s.name} — پژوهش`,
    html: `
      <div class="page fade-in">
        <button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/sources">${icon('right', 13)} منابع</button>

        <header class="page-head mt-4">
          <div class="row gap-2">
            <i class="dot ${paused ? 'dot-warn' : 'dot-live'}"></i>
            <span class="xs muted">${paused ? 'متوقف' : 'در حال پایش'} · ${esc(cfg.frequency || s.frequency)} · آخرین بررسی ${esc(s.lastChecked)}</span>
          </div>
          <h1 class="h1 mt-3">${esc(s.name)}</h1>
          <a class="link small latin" href="https://${esc(s.domain)}" target="_blank" rel="noopener">${esc(s.domain)} ${icon('external', 12)}</a>

          <div class="row wrap gap-6 mt-5">
            ${statBlock('مقاله یافت‌شده', num(s.total))}
            ${statBlock('مرتبط با شما', num(s.relevant))}
            ${statBlock('تازه این هفته', num(s.newThisWeek))}
            ${statBlock('موضوع', num((s.topics || []).length))}
          </div>
        </header>

        ${tabBar([
          { id: 'articles', label: 'مقاله‌ها', count: articles.length },
          { id: 'topics', label: 'موضوع‌ها' },
          { id: 'activity', label: 'فعالیت' },
          { id: 'settings', label: 'تنظیمات' },
        ], state.tab, 'source:tab')}

        <div>${panes[state.tab] || panes.articles}</div>
      </div>`,
  };
}

export function registerSourceActions(rerender) {
  on('source:tab', ({ id }) => { state.tab = id; rerender(); });

  on('source:pause', ({ id }) => {
    const cur = store.get().sourceState[id] || {};
    const next = cur.status === 'paused' ? 'monitoring' : 'paused';
    store.setSourceState(id, { status: next });
    toast(next === 'paused' ? 'پایش متوقف شد' : 'پایش از سر گرفته شد');
    rerender();
  });

  on('source:track', ({ id, cat }, el) => {
    const cur = store.get().sourceState[id] || {};
    const tracked = new Set(cur.tracked || []);
    if (el.querySelector('input')?.checked ?? el.checked) tracked.add(cat); else tracked.delete(cat);
    store.setSourceState(id, { tracked: [...tracked] });
  });

  on('source:remove', ({ id }) => {
    store.hideSource(id);
    toast('منبع حذف شد. مقاله‌هایش در کتابخانه شما می‌مانند.');
    location.hash = '#/sources';
    rerender();
  });

  on('source:menu', ({ id }) => { location.hash = `#/sources/${id}`; });

  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset && el.dataset.sourceFreq) {
      store.setSourceState(el.dataset.sourceFreq, { frequency: el.value });
      toast(`دوره به‌روزرسانی روی «${el.value}» تنظیم شد`);
    }
    if (el.matches?.('input[data-act="source:track"]')) {
      const { id, cat } = el.dataset;
      const cur = store.get().sourceState[id] || {};
      const tracked = new Set(cur.tracked || []);
      if (el.checked) tracked.add(cat); else tracked.delete(cat);
      store.setSourceState(id, { tracked: [...tracked] });
      toast(el.checked ? `«${cat}» پایش می‌شود` : `پایش «${cat}» متوقف شد`);
    }
  });
}

export const resetSourceTab = () => { state.tab = 'articles'; };
