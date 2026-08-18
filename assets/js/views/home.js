/* §12–16 · §61 — Home. The page opens with one thing that matters, not a
   uniform list: a lead insight, then the rest of the brief, numbered. */
import { esc, icon, greeting, num, todayLong } from '../ui.js';
import { BRIEF, TOPICS, topicName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, leadInsight, briefItem, articleCard, emptyState } from './components.js';

export function home() {
  const s = store.get();
  const name = s.account?.name?.split(' ')[0] || 'دوست من';
  const ranked = store.feed();
  const mustRead = ranked.slice(0, 3);

  const unread = ranked.filter(a => !store.isRead(a.id));
  const high = unread.filter(a => a.score >= 85).length;
  const mid = unread.filter(a => a.score >= 70 && a.score < 85).length;
  const low = Math.max(0, unread.length - high - mid);
  const total = Math.max(1, unread.length);

  const momentum = [...TOPICS].sort((a, b) => b.momentum - a.momentum).slice(0, 4);
  const topics = store.rankedTopics().slice(0, 5);
  const maxWeight = Math.max(1, ...topics.map(t => t.weight));

  const continueList = [
    ...s.read.slice(0, 2).map(id => ({ label: 'ادامه مطالعه', a: store.findArticle(id) })),
    ...s.saved.slice(0, 2).map(id => ({ label: 'ذخیره‌شده', a: store.findArticle(id) })),
  ].filter(x => x.a).slice(0, 4);

  const brief = BRIEF.filter(b => !s.dismissed.includes(b.articleId));
  const [lead, ...rest] = brief;

  return {
    layout: 'app',
    title: 'خانه — پژوهش',
    html: `
      <div class="page fade-in">

        <header class="page-head">
          <span class="eyebrow">${esc(todayLong())}</span>
          <h1 class="h1">${esc(greeting())}، ${esc(name)}</h1>
          <p class="lead">آنچه امروز برای شما مهم است — ${num(brief.length)} بینش،
            گزیده از ${num(new Set(store.allArticles().map(a => a.source)).size)} منبع.</p>
        </header>

        <!-- Section A — Daily Intelligence -->
        <section class="section">
          ${lead ? leadInsight(lead) : emptyState({
            title: 'امروز خلاصه‌ای نیست',
            body: 'از آخرین بازدید شما هیچ مطلبی از آستانه ارتباط عبور نکرد. این خودش یک نتیجه است، نه یک خلأ.',
            cta: 'رفتن به کشف', act: 'nav:go', arg: '/discover', iconName: 'compass',
          })}

          ${rest.length ? `
            <div class="mt-7">
              ${sectionHead('بقیه خلاصه امروز', '', 'خلاصه روزانه')}
              <div class="stagger">
                ${rest.map((b, i) => briefItem(b, i + 2)).join('')}
              </div>
            </div>` : ''}
        </section>

        <!-- Section B — Worth Your Time -->
        <section class="section">
          ${sectionHead('ارزش وقت شما',
            `<button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/discover">همه پیشنهادها ${icon('left', 13)}</button>`,
            'حداکثر پنج مقاله')}
          <div class="grid grid-auto stagger">
            ${mustRead.map(a => articleCard(a)).join('')}
          </div>
        </section>

        <div class="grid grid-2 gap-7">
          <!-- Section C — What's New -->
          <section class="section">
            ${sectionHead('از آخرین بازدید شما')}
            <div class="card">
              <div class="row gap-4" style="align-items:baseline">
                <span class="stat"><b class="tnum">${num(unread.length)}</b></span>
                <span class="muted">مقاله تازه جمع‌آوری شد</span>
              </div>
              <div class="dist mt-5">
                <i class="hi"  style="width:${(high / total) * 100}%"></i>
                <i class="mid" style="width:${(mid / total) * 100}%"></i>
                <i class="low" style="width:${(low / total) * 100}%"></i>
              </div>
              <div class="dist-key">
                <span><i class="hi" style="background:var(--wine)"></i> ارتباط بالا · ${num(high)}</span>
                <span><i class="mid" style="background:var(--crimson)"></i> مرتبط · ${num(mid)}</span>
                <span><i class="low" style="background:var(--blush-2)"></i> اولویت پایین · ${num(low)}</span>
              </div>
              <p class="xs muted-2 mt-5">موارد کم‌اولویت جمع‌آوری می‌شوند اما هرگز اعلان نمی‌گیرند.</p>
            </div>
          </section>

          <!-- Section D — Emerging Topics -->
          <section class="section">
            ${sectionHead('موضوع‌های در حال شتاب')}
            <div class="card">
              ${momentum.map(t => `
                <div class="trend">
                  <button class="link" data-act="nav:go" data-id="/topics/${t.id}">${esc(t.name)}</button>
                  <span class="${t.momentum >= 0 ? 'trend-up' : 'muted small'}">
                    ${t.momentum >= 0 ? '+' : '−'}٪${num(Math.abs(t.momentum))}
                  </span>
                </div>`).join('')}
              <p class="xs muted-2 mt-4">از مطالب تازه منابع شما، وزن‌دهی‌شده با آنچه می‌خوانید.</p>
            </div>
          </section>
        </div>

        <!-- §54 — the product shows it is learning -->
        <section class="section">
          ${sectionHead('موضوع‌های شما',
            `<button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/settings">تنظیم علاقه‌مندی‌ها</button>`,
            'آنچه یاد گرفته‌ایم')}
          <div class="card">
            <div class="meter">
              ${topics.map(t => `
                <div class="meter-track"><i style="width:${(t.weight / maxWeight) * 100}%"></i></div>
                <button class="link small" data-act="nav:go" data-id="/topics/${t.id}"
                  style="min-width:150px;text-align:start;border:0">${esc(t.name)}</button>
              `).join('')}
            </div>
            <p class="xs muted-2 mt-5">
              ${topics[0] ? `بیشترین علاقه شما به «${esc(topics[0].name)}» است. ` : ''}پیشنهادها با هر مطالعه دقیق‌تر می‌شوند.
            </p>
          </div>
        </section>

        <!-- Section E — Continue Researching -->
        <section class="section">
          ${sectionHead('ادامه پژوهش')}
          ${continueList.length ? `
            <div class="grid grid-auto">
              ${continueList.map(({ label, a }) => `
                <button class="card card-hover card-tight" data-act="article:open" data-id="${a.id}"
                  style="text-align:start;display:grid;gap:var(--s-3);border-width:1px">
                  <span class="eyebrow">${esc(label)}</span>
                  <span class="editorial" style="font-size:1.125rem;line-height:1.55">${esc(a.title)}</span>
                  <span class="meta">
                    <span class="badge badge-topic">${esc(topicName(a.topic))}</span>
                    <span>${num(a.minutes)} دقیقه</span>
                  </span>
                </button>`).join('')}
            </div>`
            : emptyState({
                title: 'هنوز چیزی در جریان نیست',
                body: 'مقاله‌هایی که باز یا ذخیره می‌کنید اینجا می‌آیند تا رشته کار را دوباره بگیرید.',
                cta: 'باز کردن مهم‌ترین خبر امروز', act: 'article:open', arg: BRIEF[0].articleId,
                iconName: 'book',
              })}
        </section>
      </div>`,
  };
}
