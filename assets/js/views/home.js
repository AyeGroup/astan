/* §12–16 · §61 — Home. One column, read top to bottom, no dashboard puzzle. */
import { esc, icon, greeting, num, todayLong } from '../ui.js';
import { BRIEF, TOPICS } from '../data.js';
import * as store from '../store.js';
import { sectionHead, briefStory, mini, emptyState } from './components.js';

export function home() {
  const s = store.get();
  const name = s.account?.name?.split(' ')[0] || 'دوست من';
  const ranked = store.feed();
  const unread = ranked.filter(a => !store.isRead(a.id));
  const high = unread.filter(a => a.score >= 85).length;

  const momentum = [...TOPICS].sort((a, b) => b.momentum - a.momentum).slice(0, 3);
  const topics = store.rankedTopics().slice(0, 4);
  const maxW = Math.max(1, ...topics.map(t => t.weight));

  const later = [
    ...s.read.slice(0, 2).map(id => ({ label: 'قبلاً باز کرده‌اید', a: store.findArticle(id) })),
    ...s.saved.slice(0, 2).map(id => ({ label: 'ذخیره کرده‌اید', a: store.findArticle(id) })),
  ].filter(x => x.a).slice(0, 3);

  const brief = BRIEF.filter(b => !s.dismissed.includes(b.articleId));

  return {
    layout: 'app',
    title: 'خانه — پژوهش',
    html: `
      <div class="page fade-in">

        <header class="page-head">
          <span class="label-quiet">${esc(todayLong())}</span>
          <h1 class="h1">${esc(greeting())}، ${esc(name)}</h1>
          <p class="muted">${brief.length
            ? `امروز ${num(brief.length)} خبر مهم برایتان پیدا کردیم.`
            : 'امروز خبر مهمی در منبع‌هایتان پیدا نشد.'}</p>
        </header>

        <!-- Section A — the brief itself, no wrapper needed -->
        <section class="section">
          ${brief.length ? brief.map((b, i) => briefStory(b, { lead: i === 0 })).join('')
            : emptyState({
                title: 'امروز خبر مهمی نبود',
                body: 'از آخرین باری که سر زدید، هیچ مقاله‌ای به‌اندازه کافی مهم نبود که خبرش را بدهیم. یعنی چیزی را از دست نداده‌اید.',
                cta: 'دیدن پیشنهادهای دیگر', act: 'nav:go', arg: '/discover',
              })}
        </section>

        <!-- Section B — Worth your time -->
        <section class="section">
          ${sectionHead('ارزش خواندن دارد',
            `<button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/discover">همه پیشنهادها ${icon('left', 13)}</button>`,
            'مقاله‌هایی که با موضوع‌های شما هم‌خوانی دارند')}
          <div class="grid grid-auto">
            ${ranked.slice(0, 3).map(mini).join('')}
          </div>
        </section>

        <!-- Section C + D — what arrived, what is heating up -->
        <section class="section">
          ${sectionHead('از آخرین باری که سر زدید')}
          <div class="card card-quiet">
            <div class="row gap-4 wrap between">
              <div>
                <p><b class="h1 tnum">${num(unread.length)}</b> مقاله تازه جمع شد</p>
                <p class="small muted mt-2">از این تعداد ${num(high)} مقاله به موضوع‌های شما نزدیک است. بقیه بدون اعلان در کتابخانه‌تان ذخیره شده‌اند.</p>
              </div>
              <button class="btn btn-sm" data-act="nav:go" data-id="/library">دیدن کتابخانه</button>
            </div>

            <div class="divider mt-5"></div>

            <p class="label mt-5">این هفته بیشتر درباره این موضوع‌ها نوشته‌اند</p>
            <div class="mt-4">
              ${momentum.map(t => `
                <div class="kv">
                  <button class="link-ink" data-act="nav:go" data-id="/topics/${t.id}">${esc(t.name)}</button>
                  <span class="small ${t.momentum >= 0 ? 'link' : 'muted'}">
                    ${t.momentum >= 0 ? '+' : '−'}٪${num(Math.abs(t.momentum))}
                  </span>
                </div>`).join('')}
            </div>
          </div>
        </section>

        <!-- §54 — show the product is learning, in plain words -->
        <section class="section">
          ${sectionHead('موضوع‌هایی که بیشتر می‌خوانید',
            `<button class="btn btn-sm btn-ghost" data-act="nav:go" data-id="/settings">تغییر علاقه‌مندی‌ها</button>`)}
          <div class="card">
            <div class="bars">
              ${topics.map(t => `
                <div class="bar-row">
                  <button class="link-ink small clamp-1" data-act="nav:go" data-id="/topics/${t.id}"
                    style="text-align:start;border:0;background:none;cursor:pointer;padding:0">${esc(t.name)}</button>
                  <span class="bar-track"><i style="width:${(t.weight / maxW) * 100}%"></i></span>
                  <span class="xs muted tnum">${num(t.weight)}</span>
                </div>`).join('')}
            </div>
            <p class="small muted mt-5">
              ${topics[0] ? `بیشتر از همه سراغ «${esc(topics[0].name)}» می‌روید. ` : ''}هر بار مقاله‌ای می‌خوانید یا ذخیره می‌کنید، این عددها دقیق‌تر می‌شوند.
            </p>
          </div>
        </section>

        <!-- Section E — pick the thread back up -->
        ${later.length ? `
          <section class="section">
            ${sectionHead('نیمه‌کاره مانده', '', 'از جایی که رها کردید ادامه بدهید')}
            <div class="grid grid-auto">
              ${later.map(({ label, a }) => `
                <button class="mini" data-act="article:open" data-id="${a.id}" style="cursor:pointer;text-align:start">
                  <span class="label-quiet">${esc(label)}</span>
                  <h3>${esc(a.title)}</h3>
                  <span class="meta">${num(a.minutes)} دقیقه</span>
                </button>`).join('')}
            </div>
          </section>` : ''}
      </div>`,
  };
}
