/* §37–40 — Topics as small workspaces. */
import { esc, icon, on, toast, num } from '../ui.js';
import { TOPICS, TIMELINE, topicName, sourceName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, articleCard, articleRow, statBlock, tabBar, emptyState } from './components.js';

export function topicsIndex() {
  const ranked = store.rankedTopics();
  const followed = store.get().followedTopics;

  return {
    layout: 'app',
    title: 'موضوع‌ها — پژوهش',
    html: `
      <div class="page fade-in">
        <header class="page-head">
          <h1 class="h1">موضوع‌ها</h1>
          <p class="lead">هر موضوع یک فضای کاری کوچک است: چه چیزی تازه است، چه چیزی در حال شکل‌گیری، و چگونه به اینجا رسید.</p>
        </header>

        <div class="grid grid-auto">
          ${ranked.map(t => `
            <div class="card card-hover">
              <div class="row between">
                <span class="badge badge-topic">${followed.includes(t.id) ? 'در حال پایش' : 'پایش نمی‌شود'}</span>
                <span class="${t.momentum >= 0 ? 'trend-up' : 'muted small'}">${t.momentum >= 0 ? '+' : '−'}٪${num(Math.abs(t.momentum))}</span>
              </div>
              <h2 class="h2 mt-4" style="cursor:pointer" data-act="nav:go" data-id="/topics/${t.id}">${esc(t.name)}</h2>
              <div class="row gap-5 mt-4">
                ${statBlock('مقاله', num(t.articles))}
                ${statBlock('منبع', num(t.sources))}
                ${statBlock('مضمون', num(t.themes))}
              </div>
              <div class="mt-5">
                <div class="meter-track"><i style="width:${t.weight}%"></i></div>
                <p class="xs muted-2 mt-2">وزن علاقه شما · ${num(t.weight)}</p>
              </div>
              <div class="actions-inline mt-5">
                <button class="btn btn-sm" data-act="nav:go" data-id="/topics/${t.id}">باز کردن</button>
                <button class="btn btn-sm btn-ghost" data-act="topic:follow" data-id="${t.id}">
                  ${followed.includes(t.id) ? 'توقف پایش' : 'پایش موضوع'}
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
      layout: 'app', title: 'موضوع پیدا نشد',
      html: `<div class="page">${emptyState({
        title: 'موضوع پیدا نشد',
        body: 'این موضوع در فضای کاری شما نیست.',
        cta: 'بازگشت به موضوع‌ها', act: 'nav:go', arg: '/topics',
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
      : emptyState({ title: 'هنوز مقاله‌ای نیست', body: 'منبعی اضافه کنید که این موضوع را پوشش دهد تا مطالب اینجا جمع شود.', cta: 'افزودن سایت', act: 'add:open', arg: 'website' }),
    timeline: timelinePane(timeline),
    trends: trendsPane(t, articles),
    sources: sources.length
      ? `<div class="grid grid-auto">${sources.map(s => `
          <div class="card card-hover card-tight" data-act="nav:go" data-id="/sources/${s.id}" style="cursor:pointer">
            <b>${esc(s.name)}</b>
            <p class="xs muted mt-2">${num(s.relevant)} مقاله مرتبط · <span class="latin">${esc(s.domain)}</span></p>
          </div>`).join('')}</div>`
      : '<p class="muted small">هنوز هیچ منبع پایش‌شده‌ای این موضوع را پوشش نمی‌دهد.</p>',
  };

  return {
    layout: 'app',
    title: `${t.name} — پژوهش`,
    html: `
      <div class="page fade-in">
        <header class="page-head">
          <span class="eyebrow">فضای کاری موضوع</span>
          <h1 class="h1 mt-3">${esc(t.name)}</h1>
          <div class="row wrap gap-6 mt-5">
            ${statBlock('مقاله پایش‌شده', num(t.articles))}
            ${statBlock('منبع پوشش‌دهنده', num(t.sources))}
            ${statBlock('مضمون نوظهور', num(t.themes))}
            ${statBlock('علاقه شما', num(weight))}
          </div>
          <div class="actions-inline mt-5">
            <button class="btn ${monitoring ? '' : 'btn-primary'}" data-act="topic:follow" data-id="${t.id}">
              ${monitoring ? `${icon('check', 14)} در حال پایش` : 'پایش این موضوع'}
            </button>
            <button class="btn btn-ghost" data-act="research:ask" data-q="در سه ماه گذشته در «${esc(t.name)}» چه تغییر کرد؟">
              ${icon('spark', 14)} پرسیدن از پژوهش درباره این موضوع
            </button>
          </div>
          ${monitoring ? `
            <div class="callout mt-5" style="padding:var(--s-4)">
              <span class="eyebrow">درباره این‌ها به شما اطلاع می‌دهیم</span>
              <ul class="reasons mt-3">
                <li>مقاله‌های مهم تازه</li>
                <li>تحولات بزرگ</li>
                <li>روندهای نوظهور</li>
                <li>تغییرات معنادار نسبت به آنچه می‌دانید</li>
              </ul>
              <p class="xs muted-2 mt-3">فقط درون برنامه. خلاصه ایمیلی در نسخه‌های بعدی می‌آید.</p>
            </div>` : ''}
        </header>

        ${tabBar([
          { id: 'overview', label: 'نمای کلی' },
          { id: 'articles', label: 'مقاله‌ها', count: articles.length },
          { id: 'timeline', label: 'خط زمانی' },
          { id: 'trends', label: 'روندها' },
          { id: 'sources', label: 'منابع', count: sources.length },
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
      ${sectionHead('جمع‌بندی پژوهش')}
      <p class="lead" style="max-width:var(--measure)">
        کتابخانه شما ${num(articles.length)} مقاله درباره «${esc(t.name)}» از
        ${num(new Set(articles.map(a => a.source)).size)} منبع دارد.
        شتاب این هفته ${t.momentum >= 0 ? `٪${num(t.momentum)} افزایش` : `٪${num(Math.abs(t.momentum))} کاهش`} داشته است.
      </p>
      ${timeline.length ? `
        <p class="lead mt-4" style="max-width:var(--measure)">
          تازه‌ترین تحولی که منابع شما ثبت کرده‌اند:
          <span class="muted">${esc(timeline.at(-1).text)}</span>
        </p>` : ''}
      <p class="xs muted-2 mt-3">بر پایه ${num(articles.length)} منبع در کتابخانه شما. هرجا منابع اختلاف دارند، هر دو نگه داشته می‌شوند.</p>
    </section>

    <section class="section">
      ${sectionHead('تازه‌ترین تحولات')}
      <div class="grid grid-auto">${latest.map(a => articleCard(a, { showReasons: false })).join('')}</div>
    </section>

    <section class="section">
      ${sectionHead('مهم‌ترین بینش‌ها')}
      <ol class="insight-list">
        ${insights.map(i => `
          <li>
            <div>
              <h4>${esc(i.h)}</h4>
              <p>${esc(i.p)}</p>
              <button class="link small mt-2" data-act="article:open" data-id="${i.id}">باز کردن منبع</button>
            </div>
          </li>`).join('')}
      </ol>
    </section>

    <section class="section">
      ${sectionHead('مفاهیم نوظهور')}
      <div class="row wrap gap-2">
        ${['پروتکل ابزار', 'آزمون انطباق', 'مجموعه ارزیابی', 'سیاست حافظه', 'سوابق خاستگاه', 'کیفیت مسیریابی']
          .map(c => `<span class="chip" aria-pressed="false">${esc(c)}</span>`).join('')}
      </div>
      <p class="xs muted-2 mt-4">استخراج‌شده از متن مقاله‌ها، نه از برچسب‌ها.</p>
    </section>`;
}

function timelinePane(timeline) {
  if (!timeline.length) {
    return emptyState({
      title: 'مطلب کافی برای خط زمانی نیست',
      body: 'خط زمانی از آنچه مقاله‌ها رخ‌داده توصیف می‌کنند ساخته می‌شود، نه از تاریخ انتشار. این موضوع اول به منابع بیشتری نیاز دارد.',
      cta: 'افزودن منبع', act: 'add:open', arg: 'website',
    });
  }
  return `
    <div class="timeline">
      ${timeline.map(e => `
        <div class="timeline-item" data-major="${!!e.major}">
          <div class="timeline-month eyebrow">${esc(e.month)}</div>
          <p style="max-width:var(--measure)">${esc(e.text)}</p>
          <button class="link small mt-2" data-act="article:open" data-id="${e.source}">منبع</button>
        </div>`).join('')}
    </div>
    <p class="xs muted-2 mt-4">رویدادها از محتوای مقاله استخراج می‌شوند، نه از تاریخ انتشار.</p>`;
}

function trendsPane(t, articles) {
  const bySource = {};
  articles.forEach(a => { bySource[a.source] = (bySource[a.source] || 0) + 1; });
  const max = Math.max(1, ...Object.values(bySource));
  return `
    <section class="section">
      ${sectionHead('شتاب')}
      <div class="trend">
        <span>«${esc(t.name)}» در کل</span>
        <span class="${t.momentum >= 0 ? 'trend-up' : 'muted'}">${t.momentum >= 0 ? '+' : '−'}٪${num(Math.abs(t.momentum))} این هفته</span>
      </div>
      <div class="trend"><span>مضمون‌های نوظهور پایش‌شده</span><span class="tnum small">${num(t.themes)}</span></div>
      <div class="trend"><span>منابع مشارکت‌کننده</span><span class="tnum small">${num(t.sources)}</span></div>
    </section>
    <section class="section">
      ${sectionHead('این موضوع از کجا می‌آید')}
      <div class="meter">
        ${Object.entries(bySource).map(([sid, n]) => `
          <div class="meter-track"><i style="width:${(n / max) * 100}%"></i></div>
          <span class="small muted" style="min-width:160px">${esc(sourceName(sid))} · ${num(n)}</span>
        `).join('')}
      </div>
    </section>`;
}

export function registerTopicActions(rerender) {
  on('topic:tab', ({ id }) => { state.tab = id; rerender(); });
  on('topic:follow', ({ id }) => {
    const nowFollowing = store.toggleFollowTopic(id);
    toast(nowFollowing ? `«${topicName(id)}» در حال پایش است` : `پایش «${topicName(id)}» متوقف شد`);
    rerender();
  });
}

export const resetTopicTab = () => { state.tab = 'overview'; };
