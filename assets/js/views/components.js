/* Shared presentational pieces. Every card states its own reasoning (§26). */
import { esc, icon, relevanceBar, relativeDay, num } from '../ui.js';
import { topicName, sourceName } from '../data.js';
import * as store from '../store.js';

/* §8 rhythm: an eyebrow above, a heading, a firm rule below. */
export const sectionHead = (title, right = '', eyebrow = '') => `
  <div class="section-head">
    <div class="titles">
      ${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}
      <h2 class="h2">${esc(title)}</h2>
    </div>
    ${right}
  </div>`;

export const articleMeta = a => `
  <div class="meta">
    <span class="latin">${esc(sourceName(a.source))}</span>
    <span class="sep">·</span>
    <span>${esc(relativeDay(a.date))}</span>
    <span class="sep">·</span>
    <span>${num(a.minutes)} دقیقه</span>
  </div>`;

/* §26 — the recommendation card. */
export function articleCard(a, { showReasons = true } = {}) {
  const score = a.score ?? store.personalRelevance(a);
  const saved = store.isSaved(a.id);
  return `
    <article class="article-card">
      <div class="row between gap-2">
        <span class="badge badge-topic">${esc(topicName(a.topic))}</span>
        ${relevanceBar(score)}
      </div>

      <h3 data-act="article:open" data-id="${a.id}">${esc(a.title)}</h3>
      <p class="summary clamp-3">${esc(a.summary)}</p>
      ${articleMeta(a)}

      ${showReasons ? `
        <ul class="reasons">
          ${a.reasons.slice(0, 2).map(r => `<li>${esc(r)}</li>`).join('')}
        </ul>` : ''}

      <footer>
        <div class="actions-inline">
          <button class="btn btn-sm btn-primary" data-act="article:open" data-id="${a.id}">بخوانید</button>
          <button class="btn btn-sm btn-ghost" data-act="article:save" data-id="${a.id}" aria-pressed="${saved}">
            ${icon('bookmark', 14)} ${saved ? 'ذخیره شد' : 'ذخیره'}
          </button>
        </div>
        <div class="actions-inline">
          <button class="btn btn-sm btn-ghost" data-act="article:why" data-id="${a.id}">چرا این؟</button>
          <button class="btn btn-ghost btn-icon btn-sm" data-act="article:dismiss" data-id="${a.id}"
            title="علاقه‌مند نیستم" aria-label="علاقه‌مند نیستم">${icon('x', 14)}</button>
        </div>
      </footer>
    </article>`;
}

/* Dense row for Library, search results and source listings. */
export function articleRow(a) {
  const score = a.score ?? store.personalRelevance(a);
  return `
    <div class="list-row" data-act="article:open" data-id="${a.id}">
      <div class="grow">
        <div class="row gap-2 wrap">
          <span class="badge badge-topic">${esc(topicName(a.topic))}</span>
          ${store.isSaved(a.id) ? '<span class="badge">ذخیره‌شده</span>' : ''}
          ${store.isRead(a.id) ? '<span class="badge badge-outline">خوانده‌شده</span>' : ''}
        </div>
        <h3 class="mt-3">${esc(a.title)}</h3>
        <p class="small muted mt-2 clamp-2">${esc(a.summary)}</p>
        ${articleMeta(a)}
      </div>
      <div class="col gap-3" style="align-items:flex-end;flex:none">
        ${relevanceBar(score)}
        <button class="btn btn-sm btn-ghost" data-act="article:save" data-id="${a.id}">
          ${icon('bookmark', 14)} ${store.isSaved(a.id) ? 'ذخیره شد' : 'ذخیره'}
        </button>
      </div>
    </div>`;
}

/* §12 — the single most important insight of the day, given real weight. */
export function leadInsight(b) {
  const linked = store.findArticle(b.articleId);
  const score = linked ? store.personalRelevance(linked) : b.relevance;
  return `
    <article class="lead-card">
      <div class="row between gap-3 wrap" style="position:relative;z-index:1">
        <div class="row gap-3">
          <span class="eyebrow">مهم‌ترین خبر امروز</span>
          <span class="badge badge-topic">${esc(topicName(b.topicId))}</span>
        </div>
        ${relevanceBar(score)}
      </div>

      <h2 data-act="article:open" data-id="${b.articleId}">${esc(b.title)}</h2>
      <p class="summary">${esc(b.summary)}</p>

      <div class="why">
        <span class="eyebrow">چرا مهم است</span>
        <p>${esc(b.why)}</p>
      </div>

      <footer>
        <span class="row gap-2 xs" style="color:var(--on-wine-3)">
          ${icon('layers', 14)} بر پایه ${num(b.basedOn)} منبع در کتابخانه شما
        </span>
        <div class="actions-inline">
          <button class="btn btn-onwine" data-act="article:open" data-id="${b.articleId}">
            خواندن منبع ${icon('left', 14)}
          </button>
          <button class="btn btn-onwine-ghost" data-act="article:save" data-id="${b.articleId}">
            ${icon('bookmark', 14)} ذخیره
          </button>
        </div>
      </footer>
    </article>`;
}

/* The rest of the brief: numbered, scannable, still explained. */
export function briefItem(b, index) {
  const linked = store.findArticle(b.articleId);
  const score = linked ? store.personalRelevance(linked) : b.relevance;
  return `
    <article class="brief-item">
      <span class="brief-num">${num(index)}</span>
      <div>
        <div class="row between gap-3 wrap" style="margin-bottom:var(--s-3)">
          <span class="badge badge-topic">${esc(topicName(b.topicId))}</span>
          ${relevanceBar(score)}
        </div>
        <h3 data-act="article:open" data-id="${b.articleId}">${esc(b.title)}</h3>
        <p class="summary">${esc(b.summary)}</p>
        <div class="why">
          <span class="eyebrow">چرا مهم است</span>
          <p>${esc(b.why)}</p>
        </div>
        <div class="row between wrap gap-3 mt-4">
          <span class="meta">${icon('layers', 13)} بر پایه ${num(b.basedOn)} منبع</span>
          <button class="btn btn-sm" data-act="article:open" data-id="${b.articleId}">
            خواندن منبع ${icon('left', 13)}
          </button>
        </div>
      </div>
    </article>`;
}

/* §46 — an empty state always offers the next action. */
export const emptyState = ({ title, body, cta, act, arg = '', center = false, iconName = 'compass' }) => `
  <div class="state${center ? ' center' : ''}">
    <span class="state-icon">${icon(iconName, 24)}</span>
    <h3 class="h2">${esc(title)}</h3>
    <p class="muted" style="max-width:44ch;line-height:1.85">${esc(body)}</p>
    ${cta ? `<button class="btn btn-primary btn-lg" data-act="${act}" data-id="${esc(arg)}">${esc(cta)}</button>` : ''}
  </div>`;

/* §48 — a failure names its likely causes and a way forward. */
export const errorState = ({ title, reasons = [], actions = '' }) => `
  <div class="state state-error">
    <span class="state-icon">${icon('x', 24)}</span>
    <h3 class="h2">${esc(title)}</h3>
    ${reasons.length ? `
      <div>
        <span class="eyebrow">دلایل احتمالی</span>
        <ul class="reasons mt-3">${reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      </div>` : ''}
    ${actions ? `<div class="actions-inline">${actions}</div>` : ''}
  </div>`;

export const statBlock = (label, value) => `
  <div class="stat">
    <b class="tnum">${esc(value)}</b>
    <span>${esc(label)}</span>
  </div>`;

export const tabBar = (tabs, active, act) => `
  <div class="tabs" role="tablist">
    ${tabs.map(t => `
      <button class="tab" role="tab" aria-selected="${t.id === active}"
        data-act="${act}" data-id="${t.id}">${esc(t.label)}${
          t.count != null ? ` <span class="count">${num(t.count)}</span>` : ''}</button>
    `).join('')}
  </div>`;
