/* §12–16 · §61 — Home: the centre of gravity. */
import { esc, icon, greeting } from '../ui.js';
import { BRIEF, TOPICS, topicName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, insightCard, articleCard, emptyState } from './components.js';

export function home() {
  const s = store.get();
  const name = s.account?.name?.split(' ')[0] || 'there';
  const ranked = store.feed({ excludeRead: false });
  const mustRead = ranked.slice(0, 5);
  const unread = ranked.filter(a => !store.isRead(a.id));
  const high = unread.filter(a => a.score >= 85).length;
  const mid = unread.filter(a => a.score >= 70 && a.score < 85).length;
  const low = unread.length - high - mid;

  const momentum = [...TOPICS].sort((a, b) => b.momentum - a.momentum).slice(0, 4);
  const topics = store.rankedTopics().slice(0, 5);
  const continueList = [
    ...s.read.slice(0, 2).map(id => ({ id, label: 'Continue reading', a: store.findArticle(id) })),
    ...s.saved.slice(0, 2).map(id => ({ id, label: 'Saved', a: store.findArticle(id) })),
  ].filter(x => x.a).slice(0, 4);

  const brief = BRIEF.filter(b => !store.get().dismissed.includes(b.articleId));

  return {
    layout: 'app',
    title: 'Home — Research',
    html: `
      <div class="page fade-in">
        <header class="page-head">
          <span class="eyebrow">${esc(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}</span>
          <h1 class="h1 mt-3">${esc(greeting())}, ${esc(name)}</h1>
          <p class="lead">Here's what matters to you today.</p>
        </header>

        <!-- Section A — Daily Intelligence -->
        <section class="section">
          ${sectionHead('Your Daily Brief', `<span class="xs muted-2">${brief.length} insights · synthesised from ${new Set(store.allArticles().map(a => a.source)).size} sources</span>`)}
          ${brief.length
            ? brief.map(insightCard).join('')
            : emptyState({
                title: 'No brief today',
                body: 'Nothing in your sources crossed the relevance threshold since your last visit. That is a result, not a gap.',
                cta: 'Browse Discover', act: 'nav:go', arg: '/discover',
              })}
        </section>

        <!-- Section B — Must Read -->
        <section class="section">
          ${sectionHead('Worth Your Time',
            `<button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/discover">See all ${icon('right', 13)}</button>`)}
          <div class="grid grid-auto">
            ${mustRead.map(a => articleCard(a)).join('')}
          </div>
        </section>

        <div class="grid grid-2 gap-6">
          <!-- Section C — What's New -->
          <section class="section">
            ${sectionHead('Since your last visit')}
            <p class="h1 serif tnum">${unread.length}</p>
            <p class="muted small">new articles collected from your sources</p>
            <div class="mt-5">
              <div class="trend">
                <span class="row gap-2"><i class="dot dot-live"></i> Highly relevant</span>
                <span class="tnum small">${high}</span>
              </div>
              <div class="trend">
                <span class="row gap-2"><i class="dot"></i> Relevant</span>
                <span class="tnum small">${mid}</span>
              </div>
              <div class="trend">
                <span class="row gap-2"><i class="dot" style="opacity:.4"></i> Low priority</span>
                <span class="tnum small">${low}</span>
              </div>
            </div>
            <p class="xs muted-2 mt-4">Low-priority items are collected but never notified.</p>
          </section>

          <!-- Section D — Emerging Topics -->
          <section class="section">
            ${sectionHead('Topics gaining momentum')}
            ${momentum.map(t => `
              <div class="trend">
                <button class="link" data-act="nav:go" data-id="/topics/${t.id}">${esc(t.name)}</button>
                <span class="${t.momentum >= 0 ? 'trend-up' : 'muted'}">
                  ${t.momentum >= 0 ? '+' : ''}${t.momentum}%
                </span>
              </div>`).join('')}
            <p class="xs muted-2 mt-4">Computed from new material in your sources weighted by what you read.</p>
          </section>
        </div>

        <!-- Your topics -->
        <section class="section">
          ${sectionHead('Your topics',
            `<button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/settings">Adjust interests</button>`)}
          <div class="meter">
            ${topics.map(t => `
              <div class="meter-track"><i style="width:${t.weight}%"></i></div>
              <button class="link small" data-act="nav:go" data-id="/topics/${t.id}" style="min-width:130px;text-align:left">${esc(t.name)}</button>
            `).join('')}
          </div>
          <p class="xs muted-2 mt-4">Your recommendations are improving based on what you read.</p>
        </section>

        <!-- Section E — Continue Researching -->
        <section class="section">
          ${sectionHead('Continue researching')}
          ${continueList.length ? `
            <div class="rows">
              ${continueList.map(({ label, a }) => `
                <div class="list-row" data-act="article:open" data-id="${a.id}">
                  <div class="grow">
                    <span class="eyebrow">${esc(label)}</span>
                    <p class="mt-2" style="font-family:var(--font-serif)">${esc(a.title)}</p>
                    <div class="meta mt-2">
                      <span class="badge badge-topic">${esc(topicName(a.topic))}</span>
                      <span>${a.minutes} min</span>
                    </div>
                  </div>
                  ${icon('right', 14)}
                </div>`).join('')}
            </div>`
            : emptyState({
                title: 'Nothing in progress yet',
                body: 'Articles you open or save will show up here so you can pick the thread back up.',
                cta: 'Open your Daily Brief', act: 'article:open', arg: BRIEF[0].articleId,
              })}
        </section>
      </div>`,
  };
}
