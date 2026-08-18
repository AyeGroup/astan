/* ==========================================================================
   UI kernel: escaping, icons, event delegation, modal, toast.
   Views render HTML strings; behaviour attaches through [data-act].
   ========================================================================== */

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const qs  = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/* --- Icons: 1.5px stroke, 16px grid ------------------------------------- */
const PATHS = {
  home:     '<path d="M3 9.5 8 3l5 6.5"/><path d="M4.5 8.5V13h7V8.5"/>',
  compass:  '<circle cx="8" cy="8" r="6"/><path d="m10.5 5.5-1.4 3.6-3.6 1.4 1.4-3.6z"/>',
  book:     '<path d="M3 3.5h4a2 2 0 0 1 2 2V13a1.6 1.6 0 0 0-1.6-1.5H3z"/><path d="M13 3.5H9a2 2 0 0 0-2 2V13a1.6 1.6 0 0 1 1.6-1.5H13z"/>',
  hash:     '<path d="M6 2.5 4.5 13.5M11.5 2.5 10 13.5M2.5 5.5h11M2 10.5h11"/>',
  layers:   '<path d="m8 2 6 3-6 3-6-3z"/><path d="m2 8.5 6 3 6-3"/><path d="m2 11.5 6 3 6-3"/>',
  search:   '<circle cx="7.2" cy="7.2" r="4.4"/><path d="m10.6 10.6 3 3"/>',
  bell:     '<path d="M4 6.8a4 4 0 0 1 8 0c0 2.6.8 3.7 1.2 4.2H2.8C3.2 10.5 4 9.4 4 6.8Z"/><path d="M6.4 13a1.7 1.7 0 0 0 3.2 0"/>',
  settings: '<path d="M2.5 4.5h11M2.5 11.5h11"/><circle cx="6" cy="4.5" r="1.8"/><circle cx="10.5" cy="11.5" r="1.8"/>',
  plus:     '<path d="M8 3v10M3 8h10"/>',
  check:    '<path d="m3.5 8.5 3 3 6-7"/>',
  x:        '<path d="m4 4 8 8M12 4l-8 8"/>',
  left:     '<path d="M9.5 3.5 5 8l4.5 4.5"/>',
  right:    '<path d="M6.5 3.5 11 8l-4.5 4.5"/>',
  down:     '<path d="M3.5 6 8 10.5 12.5 6"/>',
  bookmark: '<path d="M4 2.8h8v10.4L8 10.4l-4 2.8z"/>',
  globe:    '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c1.8 2 1.8 10 0 12M8 2C6.2 4 6.2 12 8 14"/>',
  spark:    '<path d="M8 2.2 9.4 6.6 13.8 8 9.4 9.4 8 13.8 6.6 9.4 2.2 8l4.4-1.4z"/>',
  share:    '<path d="M8 10.5V2.5M5.2 5.3 8 2.5l2.8 2.8"/><path d="M3.5 9v4.5h9V9"/>',
  more:     '<circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>',
  external: '<path d="M9.5 3h3.5v3.5"/><path d="m13 3-5.5 5.5"/><path d="M12 9.8V13H3V4h3.2"/>',
  clock:    '<circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.4 1.6"/>',
  up:       '<path d="M8 12.5v-9M4.4 7.1 8 3.5l3.6 3.6"/>',
  user:     '<circle cx="8" cy="5.6" r="2.6"/><path d="M3 13.4c.6-2.4 2.5-3.6 5-3.6s4.4 1.2 5 3.6"/>',
  help:     '<circle cx="8" cy="8" r="6"/><path d="M6.4 6.2a1.7 1.7 0 1 1 2.2 1.7c-.4.2-.6.5-.6 1"/><circle cx="8" cy="11.2" r=".6" fill="currentColor" stroke="none"/>',
  pause:    '<path d="M6 3.5v9M10 3.5v9"/>',
  play:     '<path d="M5.5 3.2 12 8l-6.5 4.8z"/>',
  trash:    '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.4 4.5 5 13h6l.6-8.5"/>',
  filter:   '<path d="M2.5 4h11L9.4 8.6v4.2l-2.8-1.4V8.6z"/>',
  thumbUp:  '<path d="M5 13.5V7l3-4.5c.9 0 1.5.7 1.3 1.6L9 6.4h3.2c.9 0 1.5.8 1.3 1.6l-.9 4c-.1.8-.8 1.3-1.6 1.3z"/><path d="M2.4 7.2h2.4v6.3H2.4z"/>',
  thumbDn:  '<path d="M5 2.5V9l3 4.5c.9 0 1.5-.7 1.3-1.6L9 9.6h3.2c.9 0 1.5-.8 1.3-1.6l-.9-4c-.1-.8-.8-1.3-1.6-1.3z"/><path d="M2.4 2.5h2.4v6.3H2.4z"/>',
  file:     '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/>',
  link:     '<path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l1.9-1.9a2.6 2.6 0 0 0-3.7-3.7l-1 1"/><path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.8 8.5a2.6 2.6 0 0 0 3.7 3.7l1-1"/>',
  moon:     '<path d="M13 9.4A5.6 5.6 0 0 1 6.6 3a5.6 5.6 0 1 0 6.4 6.4Z"/>',
  sun:      '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5 3.4 3.4"/>',
  eye:      '<path d="M1.6 8S3.9 3.8 8 3.8 14.4 8 14.4 8 12.1 12.2 8 12.2 1.6 8 1.6 8Z"/><circle cx="8" cy="8" r="1.8"/>',
  refresh:  '<path d="M13 7A5.2 5.2 0 0 0 3.6 4.8"/><path d="M3 3v2.4h2.4"/><path d="M3 9a5.2 5.2 0 0 0 9.4 2.2"/><path d="M13 13v-2.4h-2.4"/>',
};

export function icon(name, size = 16) {
  const d = PATHS[name] || '';
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${d}</svg>`;
}

/* --- Action registry / delegation --------------------------------------- */
const actions = new Map();
export const on = (name, fn) => actions.set(name, fn);

export function initDelegation(root = document.body) {
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = actions.get(el.dataset.act);
    if (!fn) return;
    e.preventDefault();
    fn(el.dataset, el, e);
  });
  root.addEventListener('submit', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = actions.get(el.dataset.act);
    if (!fn) return;
    e.preventDefault();
    fn(el.dataset, el, e);
  });
  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const el = e.target.closest('[data-act-enter]');
    if (!el) return;
    const fn = actions.get(el.dataset.actEnter);
    if (!fn) return;
    e.preventDefault();
    fn(el.dataset, el, e);
  });
}

/* --- Toast --------------------------------------------------------------- */
export function toast(message, iconName = 'check') {
  let host = qs('.toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon(iconName, 14)}<span>${esc(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 200ms';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

/* --- Modal --------------------------------------------------------------- */
let modalEl = null;
let lastFocus = null;

export function closeModal() {
  if (!modalEl) return;
  modalEl.remove();
  modalEl = null;
  document.body.style.overflow = '';
  if (lastFocus && lastFocus.isConnected) lastFocus.focus();
}

export function openModal({ title = '', subtitle = '', body = '', foot = '', wide = false, dismissible = true }) {
  closeModal();
  lastFocus = document.activeElement;
  modalEl = document.createElement('div');
  modalEl.className = 'overlay';
  modalEl.innerHTML = `
    <div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <div>
          <h2 class="h2">${esc(title)}</h2>
          ${subtitle ? `<p class="small muted mt-2">${subtitle}</p>` : ''}
        </div>
        ${dismissible ? `<button class="btn btn-ghost btn-icon" data-act="modal:close" aria-label="بستن">${icon('x')}</button>` : ''}
      </div>
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div>`;
  document.body.appendChild(modalEl);
  document.body.style.overflow = 'hidden';
  if (dismissible) {
    modalEl.addEventListener('mousedown', e => { if (e.target === modalEl) closeModal(); });
  }
  const focusable = qs('input, textarea, button', modalEl);
  if (focusable) setTimeout(() => focusable.focus(), 40);
  return modalEl;
}

export const modalBody = () => modalEl && qs('.modal-body', modalEl);
export const modalRoot = () => modalEl;

export function setModal({ title, subtitle, body, foot }) {
  if (!modalEl) return;
  if (title != null) qs('.modal-head .h2', modalEl).textContent = title;
  if (subtitle !== undefined) {
    const head = qs('.modal-head > div', modalEl);
    let sub = qs('.modal-head p', modalEl);
    if (!subtitle) sub?.remove();
    else {
      if (!sub) {
        sub = document.createElement('p');
        sub.className = 'small muted mt-2';
        head.appendChild(sub);
      }
      sub.innerHTML = subtitle;
    }
  }
  if (body != null) qs('.modal-body', modalEl).innerHTML = body;
  if (foot != null) {
    let f = qs('.modal-foot', modalEl);
    if (!f) {
      f = document.createElement('div');
      f.className = 'modal-foot';
      qs('.modal', modalEl).appendChild(f);
    }
    f.innerHTML = foot;
  }
}

on('modal:close', closeModal);

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* Word-splitting for matching. JS \w is ASCII-only, so a \W split drops every
   Persian letter; split on whitespace, punctuation and ZWNJ instead. */
export const words = str => String(str)
  .toLowerCase()
  .split(/[\s\u200c،؛_.:!?؟«»()\[\]{}"'`\-–—/\\]+/)
  .filter(Boolean);

/* --- Persian formatting -------------------------------------------------- */
/* Digits stay Persian throughout; the width of a percentage bar does not. */
export const num = n => Number(n).toLocaleString('fa-IR');

export const fmtDate = iso => new Date(iso + 'T00:00:00')
  .toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', year: 'numeric' });

export function relativeDay(iso) {
  const days = Math.round((Date.now() - new Date(iso + 'T00:00:00')) / 86400000);
  if (days <= 0) return 'امروز';
  if (days === 1) return 'دیروز';
  if (days < 7) return `${num(days)} روز پیش`;
  return fmtDate(iso);
}

/* Relevance: scores cluster in the 80s–90s, so a ring or bar reads as "full"
   on every card and encodes nothing. The number carries the meaning. */
export const relevanceBar = n => `
  <span class="relevance" title="${num(n)} درصد مرتبط با پژوهش شما">
    <b class="val">٪${num(n)}</b>
    <span class="lbl">مرتبط</span>
  </span>`;

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'صبح بخیر' : h < 18 ? 'ظهر بخیر' : 'عصر بخیر';
};

/* Long Persian date for the Home header, e.g. «سه‌شنبه ۲۷ مرداد». */
export const todayLong = () => new Date()
  .toLocaleDateString('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' });

/* Run async steps, rendering progress into a container. */
export function runSteps(container, steps, { onDone, stepMs = 620 } = {}) {
  const render = i => {
    container.innerHTML = `
      <div class="steps">
        ${steps.map((s, k) => `
          <div class="step" data-state="${k < i ? 'done' : k === i ? 'active' : 'idle'}">
            <span class="step-mark">${k < i ? icon('check', 13) : ''}</span>
            <span>${esc(s.label)}</span>
            ${k < i && s.note ? `<span class="note">${esc(s.note)}</span>` : ''}
          </div>`).join('')}
      </div>
      <div class="progress mt-5"><i style="width:${Math.round((i / steps.length) * 100)}%"></i></div>`;
  };
  let i = 0;
  render(0);
  const tick = () => {
    i += 1;
    render(i);
    if (i < steps.length) setTimeout(tick, stepMs);
    else if (onDone) setTimeout(onDone, 420);
  };
  const timer = setTimeout(tick, stepMs);
  return () => clearTimeout(timer);
}
