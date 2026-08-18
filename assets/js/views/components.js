/* Shared presentational pieces used across screens. */
import { esc, icon, relevanceBar, relativeDay } from '../ui.js';
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
    <span>${a.minutes} min read</span>
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
          <button class="btn btn-sm" data-act="article:open" data-id="${a.id}">Read</button>
          <button class="btn btn-sm btn-ghost" data-act="article:save" data-id="${a.id}" aria-pressed="${saved}">
            ${icon('bookmark', 14)} ${saved ? 'Saved' : 'Save'}
          </button>
        </div>
        <div class="actions-inline">
          <button class="btn btn-sm btn-ghost" data-act="article:why" data-id="${a.id}" title="Why am I seeing this?">Why this?</button>
          <button class="btn btn-ghost btn-icon btn-sm" data-act="article:dismiss" data-id="${a.id}" title="Not interested" aria-label="Not interested">${icon('x', 14)}</button>
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
          ${store.isSaved(a.id) ? '<span class="badge">Saved</span>' : ''}
          ${store.isRead(a.id) ? '<span class="badge badge-outline">Read</span>' : ''}
        </div>
        <h3 class="mt-2" style="font-family:var(--font-serif);font-weight:400;font-size:1.0625rem">${esc(a.title)}</h3>
        <p class="small muted mt-2 clamp-2">${esc(a.summary)}</p>
        ${articleMeta(a)}
      </div>
      <div class="col gap-2" style="align-items:flex-end;flex:none">
        ${relevanceBar(score)}
        <button class="btn btn-sm btn-ghost" data-act="article:save" data-id="${a.id}">
          ${icon('bookmark', 14)} ${store.isSaved(a.id) ? 'Saved' : 'Save'}
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
        <span class="eyebrow">Why it matters</span>
        <p>${esc(b.why)}</p>
      </div>
      <div class="row between wrap gap-2">
        <span class="meta">${icon('layers', 13)} Based on ${b.basedOn} sources in your library</span>
        <button class="btn btn-sm btn-ghost" data-act="article:open" data-id="${b.articleId}">
          Read the source ${icon('right', 13)}
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
        <span class="eyebrow">Possible reasons</span>
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
