/* §23 Sources · §24 Source detail */
import { esc, icon, on, toast } from '../ui.js';
import { topicName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, articleRow, statBlock, tabBar, emptyState } from './components.js';

export function sourcesIndex() {
  const sources = store.allSources();
  const st = store.get().sourceState;

  return {
    layout: 'app',
    title: 'Sources — Research',
    html: `
      <div class="page fade-in">
        <header class="page-head">
          <div class="row between wrap gap-4">
            <div>
              <h1 class="h1">Sources</h1>
              <p class="lead">Websites and documents being watched on your behalf.</p>
            </div>
            <button class="btn btn-primary" data-act="add:open" data-kind="website">${icon('plus', 14)} Add source</button>
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
                      <span class="xs muted">${paused ? 'Paused' : 'Monitoring'} · ${esc(cfg.frequency || s.frequency)}</span>
                    </div>
                    <button class="btn btn-ghost btn-icon btn-sm" data-act="source:menu" data-id="${s.id}" aria-label="Source actions">${icon('more', 14)}</button>
                  </div>

                  <h2 class="h2 mt-4" style="cursor:pointer" data-act="nav:go" data-id="/sources/${s.id}">${esc(s.name)}</h2>
                  <p class="xs muted-2">${esc(s.domain)}</p>

                  <div class="row gap-5 mt-5">
                    ${statBlock('relevant', s.relevant.toLocaleString('en-GB'))}
                    ${statBlock('new this week', s.newThisWeek)}
                  </div>

                  <div class="row wrap gap-2 mt-4">
                    ${(s.topics || []).map(t => `<span class="badge badge-topic">${esc(topicName(t))}</span>`).join('')}
                  </div>

                  <div class="row between mt-5" style="padding-top:var(--s-3);border-top:1px solid var(--line)">
                    <span class="xs muted-2">Last checked ${esc(s.lastChecked)}</span>
                    <button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/sources/${s.id}">Open ${icon('right', 13)}</button>
                  </div>
                </div>`;
            }).join('')}
          </div>`
          : emptyState({
              title: 'No sources yet.',
              body: 'Point us at a website and we will map its structure, find the articles that fit your topics, and keep watching.',
              cta: 'Add your first source', act: 'add:open', arg: 'website',
            })}
      </div>`,
  };
}

const state = { tab: 'articles' };

export function sourceDetail(segments) {
  const s = store.findSource(segments[0]);
  if (!s) {
    return {
      layout: 'app', title: 'Source not found',
      html: `<div class="page">${emptyState({
        title: 'Source not found', body: 'That source is not in your workspace.',
        cta: 'Back to Sources', act: 'nav:go', arg: '/sources',
      })}</div>`,
    };
  }

  const cfg = store.get().sourceState[s.id] || {};
  const paused = cfg.status === 'paused';
  const articles = store.feed().filter(a => a.source === s.id);

  const panes = {
    articles: articles.length
      ? `<div class="rows">${articles.map(articleRow).join('')}</div>`
      : '<p class="muted small">No collected articles from this source yet.</p>',
    topics: `
      <div class="grid grid-auto">
        ${(s.categories || []).map(c => `
          <div class="card card-tight">
            <div class="row between">
              <b>${esc(c.name)}</b>
              <span class="tnum small muted">${c.count}</span>
            </div>
            <label class="checkbox mt-3">
              <input type="checkbox" data-act="source:track" data-id="${s.id}" data-cat="${esc(c.name)}"
                ${(cfg.tracked || []).includes(c.name) ? 'checked' : ''}>
              <span class="small">Track this category</span>
            </label>
          </div>`).join('')}
      </div>`,
    activity: `
      <div class="rows">
        ${[
          ['Checked for new articles', s.lastChecked, `${s.newThisWeek} new this week`],
          ['Relevance filter applied', 'Yesterday', `${s.total - s.relevant} filtered out as low relevance`],
          ['Structure re-mapped', '3 days ago', `${(s.categories || []).length} categories detected`],
          ['Monitoring started', '3 weeks ago', `${esc(cfg.frequency || s.frequency)} schedule`],
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
            <b>Monitoring</b>
            <p class="xs muted mt-2">${paused ? 'Paused — nothing is being collected.' : 'Active — new articles are collected and scored.'}</p>
          </div>
          <button class="switch" role="switch" aria-checked="${!paused}" data-act="source:pause" data-id="${s.id}"></button>
        </div>
        <div class="settings-row">
          <div>
            <b>Update frequency</b>
            <p class="xs muted mt-2">How often we re-check this source.</p>
          </div>
          <select class="select" style="width:auto" data-source-freq="${s.id}">
            ${['Daily', 'Every 6 hours', 'Weekly', 'Manual'].map(f =>
              `<option ${((cfg.frequency || s.frequency) === f) ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="settings-row">
          <div>
            <b>Remove source</b>
            <p class="xs muted mt-2">Collected articles stay in your library.</p>
          </div>
          <button class="btn btn-sm" data-act="source:remove" data-id="${s.id}">${icon('trash', 14)} Remove</button>
        </div>
      </div>`,
  };

  return {
    layout: 'app',
    title: `${s.name} — Research`,
    html: `
      <div class="page fade-in">
        <button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/sources">${icon('left', 13)} Sources</button>

        <header class="page-head mt-4">
          <div class="row gap-2">
            <i class="dot ${paused ? 'dot-warn' : 'dot-live'}"></i>
            <span class="xs muted">${paused ? 'Paused' : 'Monitoring'} · ${esc(cfg.frequency || s.frequency)} · last checked ${esc(s.lastChecked)}</span>
          </div>
          <h1 class="h1 mt-3">${esc(s.name)}</h1>
          <a class="link small" href="https://${esc(s.domain)}" target="_blank" rel="noopener">${esc(s.domain)} ${icon('external', 12)}</a>

          <div class="row wrap gap-6 mt-5">
            ${statBlock('articles found', s.total.toLocaleString('en-GB'))}
            ${statBlock('relevant to you', s.relevant.toLocaleString('en-GB'))}
            ${statBlock('new this week', s.newThisWeek)}
            ${statBlock('topics', (s.topics || []).length)}
          </div>
        </header>

        ${tabBar([
          { id: 'articles', label: 'Articles', count: articles.length },
          { id: 'topics', label: 'Topics' },
          { id: 'activity', label: 'Activity' },
          { id: 'settings', label: 'Settings' },
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
    toast(next === 'paused' ? 'Monitoring paused' : 'Monitoring resumed');
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
    toast('Source removed. Its articles stay in your library.');
    location.hash = '#/sources';
    rerender();
  });

  on('source:menu', ({ id }) => { location.hash = `#/sources/${id}`; });

  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset && el.dataset.sourceFreq) {
      store.setSourceState(el.dataset.sourceFreq, { frequency: el.value });
      toast(`Update frequency set to ${el.value}`);
    }
    if (el.matches?.('input[data-act="source:track"]')) {
      const { id, cat } = el.dataset;
      const cur = store.get().sourceState[id] || {};
      const tracked = new Set(cur.tracked || []);
      if (el.checked) tracked.add(cat); else tracked.delete(cat);
      store.setSourceState(id, { tracked: [...tracked] });
      toast(el.checked ? `Tracking ${cat}` : `Stopped tracking ${cat}`);
    }
  });
}

export const resetSourceTab = () => { state.tab = 'articles'; };
