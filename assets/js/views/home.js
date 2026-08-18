/* §12–16 · §61 — Home: the centre of gravity. */
import { esc, icon, greeting, num, todayLong } from '../ui.js';
import { BRIEF, TOPICS, topicName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, insightCard, articleCard, emptyState } from './components.js';

export function home() {
  const s = store.get();
  const name = s.account?.name?.split(' ')[0] || 'دوست من';
  const ranked = store.feed({ excludeRead: false });
  const mustRead = ranked.slice(0, 5);
  const unread = ranked.filter(a => !store.isRead(a.id));
  const high = unread.filter(a => a.score >= 85).length;
  const mid = unread.filter(a => a.score >= 70 && a.score < 85).length;
  const low = unread.length - high - mid;

  const momentum = [...TOPICS].sort((a, b) => b.momentum - a.momentum).slice(0, 4);
  const topics = store.rankedTopics().slice(0, 5);
  const continueList = [
    ...s.read.slice(0, 2).map(id => ({ id, label: 'ادامه مطالعه', a: store.findArticle(id) })),
    ...s.saved.slice(0, 2).map(id => ({ id, label: 'ذخیره‌شده', a: store.findArticle(id) })),
  ].filter(x => x.a).slice(0, 4);

  const brief = BRIEF.filter(b => !store.get().dismissed.includes(b.articleId));

  return {
    layout: 'app',
    title: 'خانه — پژوهش',
    html: `
      <div class="page fade-in">
        <header class="page-head">
          <span class="eyebrow">${esc(todayLong())}</span>
          <h1 class="h1 mt-3">${esc(greeting())}، ${esc(name)}</h1>
          <p class="lead">آنچه امروز برای شما مهم است.</p>
        </header>

        <!-- Section A — Daily Intelligence -->
        <section class="section">
          ${sectionHead('خلاصه روزانه شما', `<span class="xs muted-2">${num(brief.length)} بینش · ترکیب‌شده از ${num(new Set(store.allArticles().map(a => a.source)).size)} منبع</span>`)}
          ${brief.length
            ? brief.map(insightCard).join('')
            : emptyState({
                title: 'امروز خلاصه‌ای نیست',
                body: 'از آخرین بازدید شما هیچ مطلبی در منابعتان از آستانه ارتباط عبور نکرد. این خودش یک نتیجه است، نه یک خلأ.',
                cta: 'رفتن به کشف', act: 'nav:go', arg: '/discover',
              })}
        </section>

        <!-- Section B — Must Read -->
        <section class="section">
          ${sectionHead('ارزش وقت شما',
            `<button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/discover">همه ${icon('left', 13)}</button>`)}
          <div class="grid grid-auto">
            ${mustRead.map(a => articleCard(a)).join('')}
          </div>
        </section>

        <div class="grid grid-2 gap-6">
          <!-- Section C — What's New -->
          <section class="section">
            ${sectionHead('از آخرین بازدید شما')}
            <p class="h1 serif tnum">${num(unread.length)}</p>
            <p class="muted small">مقاله تازه از منابع شما جمع‌آوری شد</p>
            <div class="mt-5">
              <div class="trend">
                <span class="row gap-2"><i class="dot dot-live"></i> ارتباط بالا</span>
                <span class="tnum small">${num(high)}</span>
              </div>
              <div class="trend">
                <span class="row gap-2"><i class="dot"></i> مرتبط</span>
                <span class="tnum small">${num(mid)}</span>
              </div>
              <div class="trend">
                <span class="row gap-2"><i class="dot" style="opacity:.4"></i> اولویت پایین</span>
                <span class="tnum small">${num(low)}</span>
              </div>
            </div>
            <p class="xs muted-2 mt-4">موارد کم‌اولویت جمع‌آوری می‌شوند اما هرگز اعلان نمی‌گیرند.</p>
          </section>

          <!-- Section D — Emerging Topics -->
          <section class="section">
            ${sectionHead('موضوع‌های در حال شتاب')}
            ${momentum.map(t => `
              <div class="trend">
                <button class="link" data-act="nav:go" data-id="/topics/${t.id}">${esc(t.name)}</button>
                <span class="${t.momentum >= 0 ? 'trend-up' : 'muted'}">
                  ${t.momentum >= 0 ? '+' : '−'}٪${num(Math.abs(t.momentum))}
                </span>
              </div>`).join('')}
            <p class="xs muted-2 mt-4">محاسبه‌شده از مطالب تازه منابع شما، وزن‌دهی‌شده با آنچه می‌خوانید.</p>
          </section>
        </div>

        <!-- Your topics -->
        <section class="section">
          ${sectionHead('موضوع‌های شما',
            `<button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/settings">تنظیم علاقه‌مندی‌ها</button>`)}
          <div class="meter">
            ${topics.map(t => `
              <div class="meter-track"><i style="width:${t.weight}%"></i></div>
              <button class="link small" data-act="nav:go" data-id="/topics/${t.id}" style="min-width:130px;text-align:start">${esc(t.name)}</button>
            `).join('')}
          </div>
          <p class="xs muted-2 mt-4">پیشنهادهای شما بر پایه آنچه می‌خوانید در حال بهتر شدن است.</p>
        </section>

        <!-- Section E — Continue Researching -->
        <section class="section">
          ${sectionHead('ادامه پژوهش')}
          ${continueList.length ? `
            <div class="rows">
              ${continueList.map(({ label, a }) => `
                <div class="list-row" data-act="article:open" data-id="${a.id}">
                  <div class="grow">
                    <span class="eyebrow">${esc(label)}</span>
                    <p class="mt-2" style="font-family:var(--font-serif)">${esc(a.title)}</p>
                    <div class="meta mt-2">
                      <span class="badge badge-topic">${esc(topicName(a.topic))}</span>
                      <span>${num(a.minutes)} دقیقه</span>
                    </div>
                  </div>
                  ${icon('left', 14)}
                </div>`).join('')}
            </div>`
            : emptyState({
                title: 'هنوز چیزی در جریان نیست',
                body: 'مقاله‌هایی که باز یا ذخیره می‌کنید اینجا می‌آیند تا بتوانید رشته کار را دوباره بگیرید.',
                cta: 'باز کردن خلاصه روزانه', act: 'article:open', arg: BRIEF[0].articleId,
              })}
        </section>
      </div>`,
  };
}
