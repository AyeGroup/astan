/* Shared pieces. Every card says what it is and why it is here. */
import { esc, icon, relativeDay, num } from '../ui.js';
import { topicName, sourceName } from '../data.js';
import * as store from '../store.js';

export const sectionHead = (title, right = '', sub = '') => `
  <div class="section-head">
    <div class="titles">
      <h2 class="h2">${esc(title)}</h2>
      ${sub ? `<span class="sub">${esc(sub)}</span>` : ''}
    </div>
    ${right}
  </div>`;

export const score = n => `<span class="score"><b>٪${num(n)}</b><span>مرتبط</span></span>`;

export const articleMeta = a => `
  <div class="meta">
    <span class="latin">${esc(sourceName(a.source))}</span>
    <span class="sep">·</span>
    <span>${esc(relativeDay(a.date))}</span>
    <span class="sep">·</span>
    <span>${num(a.minutes)} دقیقه</span>
  </div>`;

/* One story per row: what it is, what it says, why you got it, one action. */
export function story(a, { lead = false } = {}) {
  const n = a.score ?? store.personalRelevance(a);
  const saved = store.isSaved(a.id);
  return `
    <article class="story${lead ? ' story-lead' : ''}">
      <div class="story-top">
        <span class="tag tag-red">${esc(topicName(a.topic))}</span>
        ${score(n)}
      </div>

      <h3 data-act="article:open" data-id="${a.id}">${esc(a.title)}</h3>
      <p class="sum">${esc(a.summary)}</p>

      <div class="story-why">
        ${icon('spark', 15)}
        <span><b>چرا برای شما؟</b> ${esc(a.reasons[0] || 'با موضوع‌های شما جور است')}</span>
      </div>

      <div class="story-foot">
        ${articleMeta(a)}
        <div class="actions">
          <button class="btn btn-sm btn-primary" data-act="article:open" data-id="${a.id}">بخوانید</button>
          <button class="btn btn-sm btn-ghost" data-act="article:save" data-id="${a.id}" aria-pressed="${saved}">
            ${icon('bookmark', 14)} ${saved ? 'ذخیره شد' : 'ذخیره'}
          </button>
          <button class="btn btn-sm btn-ghost" data-act="article:why" data-id="${a.id}">جزئیات</button>
          <button class="btn btn-ghost btn-icon btn-sm" data-act="article:dismiss" data-id="${a.id}"
            title="این را نمی‌خواهم" aria-label="این را نمی‌خواهم">${icon('x', 14)}</button>
        </div>
      </div>
    </article>`;
}

/* The daily brief uses the same shape, fed by a summary rather than an article. */
export function briefStory(b, { lead = false } = {}) {
  const linked = store.findArticle(b.articleId);
  const n = linked ? store.personalRelevance(linked) : b.relevance;
  return `
    <article class="story${lead ? ' story-lead' : ''}">
      <div class="story-top">
        <span class="tag tag-red">${esc(topicName(b.topicId))}</span>
        ${score(n)}
      </div>

      <h3 data-act="article:open" data-id="${b.articleId}">${esc(b.title)}</h3>
      <p class="sum">${esc(b.summary)}</p>

      <div class="story-why">
        ${icon('spark', 15)}
        <span><b>چرا برای شما؟</b> ${esc(b.why)}</span>
      </div>

      <div class="story-foot">
        <span class="meta">${icon('layers', 13)} از ${num(b.basedOn)} منبع در کتابخانه شما</span>
        <div class="actions">
          <button class="btn btn-sm btn-primary" data-act="article:open" data-id="${b.articleId}">بخوانید</button>
          <button class="btn btn-sm btn-ghost" data-act="article:save" data-id="${b.articleId}">
            ${icon('bookmark', 14)} ذخیره
          </button>
        </div>
      </div>
    </article>`;
}

/* Compact card for grids. */
export function mini(a) {
  const n = a.score ?? store.personalRelevance(a);
  return `
    <article class="mini">
      <div class="row between gap-2">
        <span class="tag tag-red">${esc(topicName(a.topic))}</span>
        ${score(n)}
      </div>
      <h3 data-act="article:open" data-id="${a.id}">${esc(a.title)}</h3>
      <p class="sum clamp-3">${esc(a.summary)}</p>
      ${articleMeta(a)}
      <footer>
        <button class="btn btn-sm" data-act="article:open" data-id="${a.id}">بخوانید</button>
        <div class="actions">
          <button class="btn btn-ghost btn-icon btn-sm" data-act="article:save" data-id="${a.id}"
            title="ذخیره" aria-label="ذخیره">${icon('bookmark', 14)}</button>
          <button class="btn btn-ghost btn-icon btn-sm" data-act="article:why" data-id="${a.id}"
            title="چرا این را می‌بینم؟" aria-label="چرا این را می‌بینم؟">${icon('help', 14)}</button>
        </div>
      </footer>
    </article>`;
}

export function articleRow(a) {
  const n = a.score ?? store.personalRelevance(a);
  return `
    <div class="list-row" data-act="article:open" data-id="${a.id}">
      <div class="grow">
        <div class="row gap-2 wrap">
          <span class="tag tag-red">${esc(topicName(a.topic))}</span>
          ${store.isSaved(a.id) ? '<span class="tag">ذخیره‌شده</span>' : ''}
          ${store.isRead(a.id) ? '<span class="tag tag-line">خوانده‌اید</span>' : ''}
        </div>
        <h3 class="mt-3">${esc(a.title)}</h3>
        <p class="small muted mt-2 clamp-2">${esc(a.summary)}</p>
        ${articleMeta(a)}
      </div>
      <div class="col gap-3" style="align-items:flex-end;flex:none">
        ${score(n)}
        <button class="btn btn-ghost btn-icon btn-sm" data-act="article:save" data-id="${a.id}"
          title="ذخیره" aria-label="ذخیره">${icon('bookmark', 14)}</button>
      </div>
    </div>`;
}

export const emptyState = ({ title, body, cta, act, arg = '', center = false, iconName = 'compass' }) => `
  <div class="state${center ? ' center' : ''}">
    <span class="state-ico">${icon(iconName, 22)}</span>
    <h3 class="h2">${esc(title)}</h3>
    <p class="muted" style="max-width:44ch">${esc(body)}</p>
    ${cta ? `<button class="btn btn-primary" data-act="${act}" data-id="${esc(arg)}">${esc(cta)}</button>` : ''}
  </div>`;

export const errorState = ({ title, reasons = [], actions = '' }) => `
  <div class="state state-error">
    <span class="state-ico">${icon('x', 22)}</span>
    <h3 class="h2">${esc(title)}</h3>
    ${reasons.length ? `
      <div>
        <span class="label">می‌تواند به این دلایل باشد</span>
        <ul class="mt-3" style="display:grid;gap:var(--s-2)">
          ${reasons.map(r => `<li class="small">— ${esc(r)}</li>`).join('')}
        </ul>
      </div>` : ''}
    ${actions ? `<div class="actions">${actions}</div>` : ''}
  </div>`;

export const statBlock = (label, value) => `
  <div class="stat"><b class="tnum">${esc(value)}</b><span>${esc(label)}</span></div>`;

export const tabBar = (tabs, active, act) => `
  <div class="tabs" role="tablist">
    ${tabs.map(t => `
      <button class="tab" role="tab" aria-selected="${t.id === active}"
        data-act="${act}" data-id="${t.id}">${esc(t.label)}${
          t.count != null ? ` <span class="count">${num(t.count)}</span>` : ''}</button>`).join('')}
  </div>`;
