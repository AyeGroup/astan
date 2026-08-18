/* Shared presentational pieces used across screens. */
import { esc, icon, relevanceBar, relativeDay, num } from '../ui.js';
import { topicName, sourceName } from '../data.js';
import * as store from '../store.js';

export const sectionHead = (title, right = '') => `
  <div class="section-head">
    <h2 class="h2">${esc(title)}</h2>
    ${right}
  </div>`;

export const articleMeta = a => `
  <div class="meta">
    <span>${esc(sourceName(a.source))}</span>
    <span class="sep">·</span>
    <span>${esc(relativeDay(a.date))}</span>
    <span class="sep">·</span>
    <span>${num(a.minutes)} دقیقه مطالعه</span>
  </div>`;

/* §26 — recommendation card, always carrying its own explanation. */
export function articleCard(a, { showReasons = true, compact = false } = {}) {
  const score = a.score ?? store.personalRelevance(a);
  const saved = store.isSaved(a.id);
  return `
    <article class="article-card" data-article="${a.id}">
      <div class="row between gap-2">
        <span class="badge badge-topic">${esc(topicName(a.topic))}</span>
        ${relevanceBar(score)}
      </div>
      <h3 data-act="article:open" data-id="${a.id}">${esc(a.title)}</h3>
      ${compact ? '' : `<p class="summary clamp-3">${esc(a.summary)}</p>`}
      ${articleMeta(a)}
      ${showReasons && !compact ? `
        <ul class="reasons">
          ${a.reasons.slice(0, 3).map(r => `<li>${esc(r)}</li>`).join('')}
        </ul>` : ''}
      <footer>
        <div class="actions-inline">
          <button class="btn btn-sm" data-act="article:open" data-id="${a.id}">بخوانید</button>
          <button class="btn btn-sm btn-ghost" data-act="article:save" data-id="${a.id}" aria-pressed="${saved}">
            ${icon('bookmark', 14)} ${saved ? 'ذخیره شد' : 'ذخیره'}
          </button>
        </div>
        <div class="actions-inline">
          <button class="btn btn-sm btn-ghost" data-act="article:why" data-id="${a.id}" title="چرا این را می‌بینم؟">چرا این؟</button>
          <button class="btn btn-ghost btn-icon btn-sm" data-act="article:dismiss" data-id="${a.id}" title="علاقه‌مند نیستم" aria-label="علاقه‌مند نیستم">${icon('x', 14)}</button>
        </div>
      </footer>
    </article>`;
}

/* Dense row used in Library and search results. */
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
        <h3 class="mt-2" style="font-family:var(--font-serif);font-weight:400;font-size:1.0625rem">${esc(a.title)}</h3>
        <p class="small muted mt-2 clamp-2">${esc(a.summary)}</p>
        ${articleMeta(a)}
      </div>
      <div class="col gap-2" style="align-items:flex-end;flex:none">
        ${relevanceBar(score)}
        <button class="btn btn-sm btn-ghost" data-act="article:save" data-id="${a.id}">
          ${icon('bookmark', 14)} ${store.isSaved(a.id) ? 'ذخیره شد' : 'ذخیره'}
        </button>
      </div>
    </div>`;
}

/* §12 — Daily Brief insight. */
export function insightCard(b) {
  const linked = store.findArticle(b.articleId);
  const score = linked ? store.personalRelevance(linked) : b.relevance;
  return `
    <article class="insight">
      <div class="row between gap-2">
        <span class="badge badge-topic">${esc(topicName(b.topicId))}</span>
        ${relevanceBar(score)}
      </div>
      <h3 class="insight-title" data-act="article:open" data-id="${b.articleId}">${esc(b.title)}</h3>
      <p class="insight-summary">${esc(b.summary)}</p>
      <div class="why">
        <span class="eyebrow">چرا مهم است</span>
        <p>${esc(b.why)}</p>
      </div>
      <div class="row between wrap gap-2">
        <span class="meta">${icon('layers', 13)} بر پایه ${num(b.basedOn)} منبع در کتابخانه شما</span>
        <button class="btn btn-sm btn-ghost" data-act="article:open" data-id="${b.articleId}">
          خواندن منبع ${icon('left', 13)}
        </button>
      </div>
    </article>`;
}

export const emptyState = ({ title, body, cta, act, arg = '', center = false }) => `
  <div class="state${center ? ' center' : ''}">
    <h3 class="h2">${esc(title)}</h3>
    <p class="muted" style="max-width:46ch">${esc(body)}</p>
    ${cta ? `<button class="btn btn-primary" data-act="${act}" data-id="${esc(arg)}">${esc(cta)}</button>` : ''}
  </div>`;

export const errorState = ({ title, reasons = [], actions = '' }) => `
  <div class="state state-error">
    <h3 class="h3">${esc(title)}</h3>
    ${reasons.length ? `
      <div>
        <span class="eyebrow">دلایل احتمالی</span>
        <ul class="reasons mt-2">${reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      </div>` : ''}
    ${actions ? `<div class="actions-inline">${actions}</div>` : ''}
  </div>`;

export const statBlock = (label, value) => `
  <div class="stat">
    <b class="tnum">${esc(value)}</b>
    <span class="xs muted">${esc(label)}</span>
  </div>`;

export const tabBar = (tabs, active, act) => `
  <div class="tabs" role="tablist">
    ${tabs.map(t => `
      <button class="tab" role="tab" aria-selected="${t.id === active}"
        data-act="${act}" data-id="${t.id}">${esc(t.label)}${t.count != null ? ` <span class="muted-2 tnum">${t.count}</span>` : ''}</button>
    `).join('')}
  </div>`;
