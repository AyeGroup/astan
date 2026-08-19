/* §44–45 Notifications · §54 Personalization / Settings */
import { esc, icon, on, toast, num } from '../ui.js';
import { topicName, sourceName } from '../data.js';
import * as store from '../store.js';
import { sectionHead, emptyState, tabBar } from './components.js';

const KINDS = [
  { id: 'all', label: 'همه' },
  { id: 'important', label: 'مهم' },
  { id: 'article', label: 'مقاله تازه' },
  { id: 'topic', label: 'موضوع‌ها' },
  { id: 'source', label: 'منبع‌ها' },
];

const nstate = { tab: 'all' };

export function notifications() {
  const all = store.notifications();
  const list = nstate.tab === 'all' ? all : all.filter(n => n.kind === nstate.tab);
  const unread = all.filter(n => n.unread).length;

  return {
    layout: 'app',
    title: 'اعلان‌ها — پژوهش',
    html: `
      <div class="page narrow fade-in">
        <header class="page-head">
          <div class="row between wrap gap-4">
            <div>
              <h1 class="h1">اعلان‌ها</h1>
              <p class="muted">${unread ? `${num(unread)} اعلان خوانده‌نشده دارید` : 'همه اعلان‌ها را دیده‌اید'}</p>
            </div>
            ${unread ? '<button class="btn btn-sm" data-act="notif:readAll">همه را خوانده‌شده علامت بزن</button>' : ''}
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
              title: 'خبری نیست',
              body: 'ما فقط وقتی خبر می‌دهیم که مطلب واقعاً مهم باشد. پس نبودن اعلان یعنی چیز مهمی پیش نیامده.',
            })}

        <div class="card mt-6" style="background:transparent;border-style:dashed">
          <span class="label">چرا اعلان‌ها کم است؟</span>
          <p class="small muted mt-3">
            چون تازه‌بودن به‌تنهایی کافی نیست. یک مقاله باید هم مهم باشد، هم به موضوع‌های
            شما مربوط باشد، و هم حرف تازه‌ای بزند. بقیه بدون مزاحمت وارد کتابخانه‌تان می‌شوند.
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
    title: 'تنظیمات — پژوهش',
    html: `
      <div class="page narrow fade-in">
        <header class="page-head">
          <h1 class="h1">تنظیمات</h1>
          <p class="muted">هر چیزی که درباره شما می‌دانیم اینجاست و می‌توانید عوضش کنید.</p>
        </header>

        <section class="section">
          ${sectionHead('حساب شما')}
          <div class="row gap-4">
            <span class="avatar lg">${esc((s.account?.name || 'R').slice(0, 1).toUpperCase())}</span>
            <div class="grow">
              <b>${esc(s.account?.name || 'مهمان')}</b>
              <p class="small muted latin">${esc(s.account?.email || '—')}</p>
            </div>
            <button class="btn btn-sm" data-act="account:signout">خروج از حساب</button>
          </div>
        </section>

        <section class="section">
          ${sectionHead('موضوع‌های شما')}
          <div class="row wrap gap-2">
            ${(s.interests.length ? s.interests : ['هوش مصنوعی', 'فناوری']).map(i => `<span class="chip" aria-pressed="true">${esc(i)}</span>`).join('')}
          </div>
          <p class="small muted mt-4">
            شما از پژوهش برای <b>${esc({
              updated: 'دانستن خبرها', deep: 'دنبال‌کردن عمیق', industry: 'دنبال‌کردن یک صنعت',
              learn: 'یادگیری یک موضوع', track: 'پاییدن چند سایت',
            }[s.intent] || 'دانستن خبرها')}</b> استفاده می‌کنید.
          </p>
          <button class="btn btn-sm mt-4" data-act="account:redo-onboarding">عوض کردن موضوع‌ها</button>
        </section>

        <section class="section">
          ${sectionHead('چه چیزی درباره شما یاد گرفته‌ایم', '', 'هر بار مقاله‌ای می‌خوانید این عددها عوض می‌شود')}
          <div class="meter">
            ${topics.map(t => `
              <div class="meter-track"><i style="width:${t.weight}%"></i></div>
              <span class="small muted" style="min-width:140px">${esc(t.name)} · ${num(t.weight)}</span>
            `).join('')}
          </div>
          <p class="xs muted-2 mt-4">
            ${topics[0] ? `بیشتر از همه «${esc(topics[0].name)}» را می‌خوانید.` : ''}
          </p>
        </section>

        <section class="section">
          ${sectionHead('کارهای اخیر شما', '', 'پیشنهادهای ما بر اساس همین‌هاست')}
          ${recent.length ? `
            <div class="rows">
              ${recent.map(sig => `
                <div class="list-row" style="cursor:default">
                  <div class="grow">
                    <p class="small">${esc(sig.label || sig.kind)}</p>
                    <p class="xs muted-2 mt-2">${esc(sig.kind)}${sig.topicId ? ` · ${esc(topicName(sig.topicId))}` : ''}</p>
                  </div>
                  <span class="xs ${sig.weight >= 0 ? 'trend-up' : 'muted'}">${sig.weight >= 0 ? '+' : '−'}${num(Math.abs(sig.weight))}</span>
                </div>`).join('')}
            </div>`
            : '<p class="small muted">هنوز کاری ثبت نشده. یک مقاله بخوانید یا ذخیره کنید تا اینجا بیاید.</p>'}
        </section>

        <section class="section">
          ${sectionHead('ظاهر')}
          <div class="settings-row">
            <div>
              <b>حالت تاریک</b>
              <p class="xs muted mt-2">اگر شب‌ها یا طولانی می‌خوانید، چشمتان کمتر خسته می‌شود.</p>
            </div>
            <button class="switch" role="switch" aria-checked="${store.resolvedTheme() === 'dark'}" data-act="theme:toggle"></button>
          </div>
        </section>

        <section class="section">
          ${sectionHead('داده‌ها')}
          <div class="settings-row">
            <div>
              <b>پاک‌کردن همه‌چیز</b>
              <p class="xs muted mt-2">حساب، مقاله‌های ذخیره‌شده و منبع‌هایتان از این مرورگر پاک می‌شود.</p>
            </div>
            <button class="btn btn-sm" data-act="account:reset">پاک کن</button>
          </div>
        </section>
      </div>`,
  };
}

export function registerMiscActions(rerender) {
  on('notif:tab', ({ id }) => { nstate.tab = id; rerender(); });
  on('notif:readAll', () => { store.readAllNotifications(); rerender(); toast('همه اعلان‌ها خوانده‌شده علامت خوردند.'); });
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
    store.applyTheme(null);
    location.hash = '#/';
    toast('همه‌چیز پاک شد.');
  });
}
