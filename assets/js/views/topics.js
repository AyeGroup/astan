/* §37–40 — Topics as small workspaces. */
import { esc, icon, on, toast } from '../ui.js';
import { TOPICS, TIMELINE, topicName, sourceName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, articleCard, articleRow, statBlock, tabBar, emptyState } from './components.js';

export function topicsIndex() {
  const ranked = store.rankedTopics();
  const followed = store.get().followedTopics;

  return {
    layout: 'app',
    title: 'Topics — Research',
    html: `
      <div class="page fade-in">
        <header class="page-head">
          <h1 class="h1">Topics</h1>
          <p class="lead">Each topic is a small workspace: what is new, what is emerging, and how it developed.</p>
        </header>

        <div class="grid grid-auto">
          ${ranked.map(t => `
            <div class="card card-hover">
              <div class="row between">
                <span class="badge badge-topic">${followed.includes(t.id) ? 'Monitoring' : 'Not monitored'}</span>
                <span class="${t.momentum >= 0 ? 'trend-up' : 'muted small'}">${t.momentum >= 0 ? '+' : ''}${t.momentum}%</span>
              </div>
              <h2 class="h2 mt-4" style="cursor:pointer" data-act="nav:go" data-id="/topics/${t.id}">${esc(t.name)}</h2>
              <div class="row gap-5 mt-4">
                ${statBlock('articles', t.articles)}
                ${statBlock('sources', t.sources)}
                ${statBlock('themes', t.themes)}
              </div>
              <div class="mt-5">
                <div class="meter-track"><i style="width:${t.weight}%"></i></div>
                <p class="xs muted-2 mt-2">Your interest weight · ${t.weight}</p>
              </div>
              <div class="actions-inline mt-5">
                <button class="btn btn-sm" data-act="nav:go" data-id="/topics/${t.id}">Open</button>
                <button class="btn btn-sm btn-ghost" data-act="topic:follow" data-id="${t.id}">
                  ${followed.includes(t.id) ? 'Stop monitoring' : 'Monitor topic'}
                </button>
              </div>
            </div>`).join('')}
        </div>
      </div>`,
  };
}

const state = { tab: 'overview' };

export function topicDetail(segments) {
  const id = segments[0];
  const t = TOPICS.find(x => x.id === id);
  if (!t) {
    return {
      layout: 'app', title: 'Topic not found',
      html: `<div class="page">${emptyState({
        title: 'Topic not found',
        body: 'That topic is not in your workspace.',
        cta: 'Back to Topics', act: 'nav:go', arg: '/topics',
      })}</div>`,
    };
  }

  const weight = store.get().topicWeights[t.id] ?? t.weight;
  const monitoring = store.get().followedTopics.includes(t.id);
  const articles = store.feed().filter(a => a.topic === t.id);
  const sources = store.allSources().filter(s => (s.topics || []).includes(t.id));
  const timeline = TIMELINE[t.id] || [];

  const panes = {
    overview: overviewPane(t, articles, timeline),
    articles: articles.length
      ? `<div class="rows">${articles.map(articleRow).join('')}</div>`
      : emptyState({ title: 'No articles yet', body: 'Add a source that covers this topic and material will collect here.', cta: 'Add a website', act: 'add:open', arg: 'website' }),
    timeline: timelinePane(timeline),
    trends: trendsPane(t, articles),
    sources: sources.length
      ? `<div class="grid grid-auto">${sources.map(s => `
          <div class="card card-hover card-tight" data-act="nav:go" data-id="/sources/${s.id}" style="cursor:pointer">
            <b>${esc(s.name)}</b>
            <p class="xs muted mt-2">${s.relevant} relevant articles · ${esc(s.domain)}</p>
          </div>`).join('')}</div>`
      : '<p class="muted small">No monitored source covers this topic yet.</p>',
  };

  return {
    layout: 'app',
    title: `${t.name} — Research`,
    html: `
      <div class="page fade-in">
        <header class="page-head">
          <span class="eyebrow">Topic workspace</span>
          <h1 class="h1 mt-3">${esc(t.name)}</h1>
          <div class="row wrap gap-6 mt-5">
            ${statBlock('articles tracked', t.articles.toLocaleString('en-GB'))}
            ${statBlock('sources covering it', t.sources)}
            ${statBlock('emerging themes', t.themes)}
            ${statBlock('your interest', weight)}
          </div>
          <div class="actions-inline mt-5">
            <button class="btn ${monitoring ? '' : 'btn-primary'}" data-act="topic:follow" data-id="${t.id}">
              ${monitoring ? `${icon('check', 14)} Monitoring` : 'Monitor this topic'}
            </button>
            <button class="btn btn-ghost" data-act="research:ask" data-q="What changed in ${esc(t.name)} during the last 3 months?">
              ${icon('spark', 14)} Ask Research about this topic
            </button>
          </div>
          ${monitoring ? `
            <div class="callout mt-5" style="padding:var(--s-4)">
              <span class="eyebrow">You will be notified about</span>
              <ul class="reasons mt-3">
                <li>New important articles</li>
                <li>Major developments</li>
                <li>Emerging trends</li>
                <li>Significant changes to what you already know</li>
              </ul>
              <p class="xs muted-2 mt-3">In-app only. Email digests arrive in a later version.</p>
            </div>` : ''}
        </header>

        ${tabBar([
          { id: 'overview', label: 'Overview' },
          { id: 'articles', label: 'Articles', count: articles.length },
          { id: 'timeline', label: 'Timeline' },
          { id: 'trends', label: 'Trends' },
          { id: 'sources', label: 'Sources', count: sources.length },
        ], state.tab, 'topic:tab')}

        <div>${panes[state.tab] || panes.overview}</div>
      </div>`,
  };
}

function overviewPane(t, articles, timeline) {
  const latest = articles.slice(0, 3);
  const insights = articles.flatMap(a => (a.insights || []).slice(0, 1).map(i => ({ ...i, id: a.id }))).slice(0, 4);
  return `
    <section class="section">
      ${sectionHead('Research summary')}
      <p class="lead" style="max-width:var(--measure)">
        Your library holds ${articles.length} article${articles.length === 1 ? '' : 's'} on ${esc(t.name)} from
        ${new Set(articles.map(a => a.source)).size} source${new Set(articles.map(a => a.source)).size === 1 ? '' : 's'}.
        Momentum is ${t.momentum >= 0 ? `up ${t.momentum}%` : `down ${Math.abs(t.momentum)}%`} this week.
      </p>
      ${timeline.length ? `
        <p class="lead mt-4" style="max-width:var(--measure)">
          The most recent development your sources record:
          <span class="muted">${esc(timeline.at(-1).text)}</span>
        </p>` : ''}
      <p class="xs muted-2 mt-3">Based on ${articles.length} sources in your library. Where sources disagree, both are kept.</p>
    </section>

    <section class="section">
      ${sectionHead('Latest developments')}
      <div class="grid grid-auto">${latest.map(a => articleCard(a, { showReasons: false })).join('')}</div>
    </section>

    <section class="section">
      ${sectionHead('Top insights')}
      <ol class="insight-list">
        ${insights.map(i => `
          <li>
            <div>
              <h4>${esc(i.h)}</h4>
              <p>${esc(i.p)}</p>
              <button class="link small mt-2" data-act="article:open" data-id="${i.id}">Open source</button>
            </div>
          </li>`).join('')}
      </ol>
    </section>

    <section class="section">
      ${sectionHead('Emerging concepts')}
      <div class="row wrap gap-2">
        ${['tool protocol', 'conformance tests', 'evaluation suites', 'memory policy', 'provenance records', 'routing quality']
          .map(c => `<span class="chip" aria-pressed="false">${esc(c)}</span>`).join('')}
      </div>
      <p class="xs muted-2 mt-4">Extracted from article text, not from tags.</p>
    </section>`;
}

function timelinePane(timeline) {
  if (!timeline.length) {
    return emptyState({
      title: 'Not enough material for a timeline',
      body: 'A timeline is built from what articles describe as happening, not from publication dates. This topic needs more sources first.',
      cta: 'Add a source', act: 'add:open', arg: 'website',
    });
  }
  return `
    <div class="timeline">
      ${timeline.map(e => `
        <div class="timeline-item" data-major="${!!e.major}">
          <div class="timeline-month eyebrow">${esc(e.month)}</div>
          <p style="max-width:var(--measure)">${esc(e.text)}</p>
          <button class="link small mt-2" data-act="article:open" data-id="${e.source}">Source</button>
        </div>`).join('')}
    </div>
    <p class="xs muted-2 mt-4">Events are extracted from article content, not publication dates.</p>`;
}

function trendsPane(t, articles) {
  const bySource = {};
  articles.forEach(a => { bySource[a.source] = (bySource[a.source] || 0) + 1; });
  const max = Math.max(1, ...Object.values(bySource));
  return `
    <section class="section">
      ${sectionHead('Momentum')}
      <div class="trend">
        <span>${esc(t.name)} overall</span>
        <span class="${t.momentum >= 0 ? 'trend-up' : 'muted'}">${t.momentum >= 0 ? '+' : ''}${t.momentum}% this week</span>
      </div>
      <div class="trend"><span>Emerging themes tracked</span><span class="tnum small">${t.themes}</span></div>
      <div class="trend"><span>Sources contributing</span><span class="tnum small">${t.sources}</span></div>
    </section>
    <section class="section">
      ${sectionHead('Where this topic comes from')}
      <div class="meter">
        ${Object.entries(bySource).map(([sid, n]) => `
          <div class="meter-track"><i style="width:${(n / max) * 100}%"></i></div>
          <span class="small muted" style="min-width:160px">${esc(sourceName(sid))} · ${n}</span>
        `).join('')}
      </div>
    </section>`;
}

export function registerTopicActions(rerender) {
  on('topic:tab', ({ id }) => { state.tab = id; rerender(); });
  on('topic:follow', ({ id }) => {
    const nowFollowing = store.toggleFollowTopic(id);
    toast(nowFollowing ? `Monitoring ${topicName(id)}` : `Stopped monitoring ${topicName(id)}`);
    rerender();
  });
}

export const resetTopicTab = () => { state.tab = 'overview'; };
