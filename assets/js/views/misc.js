/* §44–45 Notifications · §54 Personalization / Settings */
import { esc, icon, on, toast } from '../ui.js';
import { topicName, sourceName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, emptyState, tabBar } from './components.js';

const KINDS = [
  { id: 'all', label: 'All' },
  { id: 'important', label: 'Important' },
  { id: 'article', label: 'New articles' },
  { id: 'topic', label: 'Topic updates' },
  { id: 'source', label: 'Source updates' },
];

const nstate = { tab: 'all' };

export function notifications() {
  const all = store.notifications();
  const list = nstate.tab === 'all' ? all : all.filter(n => n.kind === nstate.tab);
  const unread = all.filter(n => n.unread).length;

  return {
    layout: 'app',
    title: 'Notifications — Research',
    html: `
      <div class="page narrow fade-in">
        <header class="page-head">
          <div class="row between wrap gap-4">
            <div>
              <h1 class="h1">Notifications</h1>
              <p class="lead">${unread ? `${unread} unread` : 'You are up to date'}</p>
            </div>
            ${unread ? '<button class="btn btn-sm" data-act="notif:readAll">Mark all read</button>' : ''}
          </div>
        </header>

        ${tabBar(KINDS.map(k => ({ ...k, count: k.id === 'all' ? all.length : all.filter(n => n.kind === k.id).length })), nstate.tab, 'notif:tab')}

        ${list.length ? `
          <div class="rows">
            ${list.map(n => `
              <div class="notif" data-unread="${n.unread}" data-act="notif:open" data-id="${n.id}"
                data-article="${n.articleId || ''}" data-topic="${n.topicId || ''}" data-source="${n.sourceId || ''}">
                <div class="notif-mark">${n.unread ? '<i class="dot dot-live"></i>' : ''}</div>
                <div class="grow">
                  <div class="row between gap-3">
                    <b class="small">${esc(n.title)}</b>
                    <span class="xs muted-2" style="flex:none">${esc(n.time)}</span>
                  </div>
                  <p class="small muted mt-2">${esc(n.body)}</p>
                </div>
              </div>`).join('')}
          </div>`
          : emptyState({
              title: 'Nothing here',
              body: 'Notifications only arrive when importance, personal relevance and novelty are all high enough. Quiet is the intended state.',
            })}

        <div class="card mt-6" style="background:transparent;border-style:dashed">
          <span class="eyebrow">How notifications are decided</span>
          <p class="small muted mt-3" style="max-width:var(--measure)">
            Nothing is sent for being new alone. Each candidate is scored as
            <b>importance × personal relevance × novelty</b>, and anything below the threshold
            is collected silently into your library instead.
          </p>
        </div>
      </div>`,
  };
}

/* ------------------------------------------------------------- Settings */
export function settings() {
  const s = store.get();
  const topics = store.rankedTopics();
  const recent = s.signals.slice(0, 8);

  return {
    layout: 'app',
    title: 'Settings — Research',
    html: `
      <div class="page narrow fade-in">
        <header class="page-head">
          <h1 class="h1">Settings</h1>
          <p class="lead">What we know about your research, and how to change it.</p>
        </header>

        <section class="section">
          ${sectionHead('Account')}
          <div class="row gap-4">
            <span class="avatar lg">${esc((s.account?.name || 'R').slice(0, 1).toUpperCase())}</span>
            <div class="grow">
              <b>${esc(s.account?.name || 'Guest')}</b>
              <p class="small muted">${esc(s.account?.email || 'Not signed in')}</p>
            </div>
            <button class="btn btn-sm" data-act="account:signout">Sign out</button>
          </div>
        </section>

        <section class="section">
          ${sectionHead('Interests', '<span class="xs muted-2">Chosen during onboarding</span>')}
          <div class="row wrap gap-2">
            ${(s.interests.length ? s.interests : ['AI', 'Technology']).map(i => `<span class="chip" aria-pressed="true">${esc(i)}</span>`).join('')}
          </div>
          <p class="small muted mt-4">
            You are using Research to <b>${esc({
              updated: 'stay updated', deep: 'research deeply', industry: 'follow an industry',
              learn: 'learn a topic', track: 'track specific websites',
            }[s.intent] || 'stay updated')}</b>.
          </p>
          <button class="btn btn-sm mt-4" data-act="account:redo-onboarding">Adjust interests</button>
        </section>

        <section class="section">
          ${sectionHead('What we have learned', '<span class="xs muted-2">Updated as you read</span>')}
          <div class="meter">
            ${topics.map(t => `
              <div class="meter-track"><i style="width:${t.weight}%"></i></div>
              <span class="small muted" style="min-width:140px">${esc(t.name)} · ${t.weight}</span>
            `).join('')}
          </div>
          <p class="xs muted-2 mt-4">
            ${topics[0] ? `You've shown strong interest in ${esc(topics[0].name)}.` : ''}
            Weights move with every save, read and dismissal.
          </p>
        </section>

        <section class="section">
          ${sectionHead('Recent signals', '<span class="xs muted-2">Everything shaping your feed</span>')}
          ${recent.length ? `
            <div class="rows">
              ${recent.map(sig => `
                <div class="list-row" style="cursor:default">
                  <div class="grow">
                    <p class="small">${esc(sig.label || sig.kind)}</p>
                    <p class="xs muted-2 mt-2">${esc(sig.kind)}${sig.topicId ? ` · ${esc(topicName(sig.topicId))}` : ''}</p>
                  </div>
                  <span class="xs ${sig.weight >= 0 ? 'trend-up' : 'muted'}">${sig.weight >= 0 ? '+' : ''}${sig.weight}</span>
                </div>`).join('')}
            </div>`
            : '<p class="small muted">Nothing recorded yet. Read or save something and it will show up here.</p>'}
        </section>

        <section class="section">
          ${sectionHead('Appearance')}
          <div class="settings-row">
            <div>
              <b>Dark mode</b>
              <p class="xs muted mt-2">A calmer surface for long reading sessions.</p>
            </div>
            <button class="switch" role="switch" aria-checked="${s.theme === 'dark'}" data-act="theme:toggle"></button>
          </div>
        </section>

        <section class="section">
          ${sectionHead('Data')}
          <div class="settings-row">
            <div>
              <b>Reset this prototype</b>
              <p class="xs muted mt-2">Clears your account, saved articles, signals and sources from this browser.</p>
            </div>
            <button class="btn btn-sm" data-act="account:reset">Reset</button>
          </div>
        </section>
      </div>`,
  };
}

export function registerMiscActions(rerender) {
  on('notif:tab', ({ id }) => { nstate.tab = id; rerender(); });
  on('notif:readAll', () => { store.readAllNotifications(); rerender(); toast('All notifications marked read'); });
  on('notif:open', ({ id, article, topic, source }) => {
    store.readNotification(id);
    if (article) location.hash = `#/article/${article}`;
    else if (topic) location.hash = `#/topics/${topic}`;
    else if (source) location.hash = `#/sources/${source}`;
    else rerender();
  });

  on('account:signout', () => { store.set({ account: null, onboarded: false }); location.hash = '#/'; });
  on('account:redo-onboarding', () => { location.hash = '#/onboarding/1'; });
  on('account:reset', () => {
    store.reset();
    store.applyTheme('light');
    location.hash = '#/';
    toast('Prototype reset');
  });
}
