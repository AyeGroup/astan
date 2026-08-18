/* §17–22 Add flows · §47 Loading states · §48 Error states */
import { esc, icon, on, toast, num, openModal, setModal, closeModal, modalBody, runSteps } from '../ui.js';
import { TOPICS, topicName } from '../data.js';
import * as store from '../store.js';
import { errorState } from './components.js';

let pending = null;   // website discovery result awaiting configuration

const validUrl = raw => {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.includes('.') ? u : null;
  } catch { return null; }
};

const titleCase = s => s.replace(/[-_]+/g, ' ').replace(/\.\w+$/, '')
  .replace(/\b\w/g, c => c.toUpperCase()).trim();

/* ------------------------------------------------------------------ Menu */
export function openAddMenu() {
  openModal({
    title: 'افزودن به پژوهش شما',
    subtitle: 'یک منبع برای شروع کافی است. همه‌چیز به یک شکل پردازش می‌شود.',
    body: `
      <div class="grid grid-2">
        ${[
          ['article', 'file', 'مقاله', 'نشانی یک مقاله را بچسبانید'],
          ['website', 'globe', 'سایت', 'پایش یک سایت را به هوش مصنوعی بسپارید'],
          ['pdf', 'file', 'PDF', 'یک سند بارگذاری کنید'],
          ['topic', 'hash', 'موضوع', 'یک موضوع را در همه منابع دنبال کنید'],
        ].map(([kind, ic, name, hint]) => `
          <button class="source-choice" data-act="add:open" data-kind="${kind}">
            ${icon(ic, 20)}
            <b>${name}</b>
            <span class="small muted">${hint}</span>
          </button>`).join('')}
      </div>`,
  });
}

/* --------------------------------------------------------------- Article */
export function openAddArticle() {
  openModal({
    title: 'افزودن یک مقاله',
    subtitle: 'آن را می‌گیریم، متنش را استخراج می‌کنیم و خلاصه، نکته‌های کلیدی و ترجمه می‌سازیم.',
    body: `
      <div class="field">
        <label for="artUrl">نشانی مقاله</label>
        <input class="input input-lg latin" id="artUrl" placeholder="https://example.com/article"
          data-act-enter="add:article-run" autocomplete="off">
        <p class="xs muted-2">نمونه اولیه: هر نشانی معتبری کار می‌کند. برای دیدن حالت خطا واژه «blocked» را در نشانی بگذارید.</p>
      </div>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">انصراف</button>
      <button class="btn btn-primary" data-act="add:article-run">تحلیل مقاله</button>`,
  });
}

function runArticle() {
  const raw = (document.getElementById('artUrl')?.value || '').trim();
  const url = validUrl(raw);

  if (!url || /blocked|fail/i.test(raw)) {
    setModal({
      title: 'Import failed',
      subtitle: '',
      body: errorState({
        title: url ? 'نتوانستیم به این مقاله دسترسی پیدا کنیم.' : 'این نشانی معتبر به نظر نمی‌رسد.',
        reasons: url
          ? ['محتوا برای غیرمشترکان بسته است', 'صفحه نیاز به ورود دارد', 'سایت دسترسی خودکار را رد کرد']
          : ['نشانی ناقص یا نادرست است', 'پیوند کامل را با https:// امتحان کنید'],
        actions: `
          <button class="btn" data-act="add:open" data-kind="article">نشانی دیگری امتحان کنید</button>
          <button class="btn btn-ghost" data-act="add:open" data-kind="pdf">سند را دستی اضافه کنید</button>`,
      }),
      foot: '<button class="btn btn-ghost" data-act="modal:close">بستن</button>',
    });
    return;
  }

  setModal({
    title: 'در حال تحلیل مقاله',
    subtitle: `در حال خواندن <b class="latin">${esc(url.hostname)}</b>. معمولاً چند ثانیه طول می‌کشد.`,
    body: '<div id="addSteps"></div>', foot: '',
  });

  runSteps(document.getElementById('addSteps'), [
    { label: 'دریافت مقاله', note: url.hostname },
    { label: 'استخراج محتوا', note: 'متن خوانا پیدا شد' },
    { label: 'درک مقاله', note: '' },
    { label: 'تولید نکته‌های کلیدی', note: '' },
    { label: 'اتصال به پژوهش‌های مرتبط', note: '' },
  ], {
    onDone: () => {
      const a = buildArticle(url);
      store.addArticle(a);
      setModal({
        title: 'مقاله با موفقیت تحلیل شد',
        subtitle: '',
        body: `
          <div class="steps">
            ${['خلاصه', 'نکته‌های کلیدی', 'موضوع‌ها', 'ترجمه', 'مقاله‌های مرتبط'].map(x => `
              <div class="step" data-state="done">
                <span class="step-mark">${icon('check', 10)}</span><span>${x}</span>
              </div>`).join('')}
          </div>
          <div class="card card-tight mt-5">
            <span class="badge badge-topic">${esc(topicName(a.topic))}</span>
            <p class="editorial mt-3" style="font-size:1.1875rem;line-height:1.55">${esc(a.title)}</p>
            <p class="xs muted mt-2"><span class="latin">${esc(url.hostname)}</span> · ${num(a.minutes)} دقیقه مطالعه · ٪${num(a.relevance)} مرتبط</p>
          </div>`,
        foot: `
          <button class="btn btn-ghost" data-act="add:open" data-kind="article">افزودن مورد دیگر</button>
          <button class="btn btn-primary" data-act="add:done-article" data-id="${a.id}">باز کردن مقاله</button>`,
      });
    },
  });
}

function buildArticle(url) {
  const slug = url.pathname.split('/').filter(Boolean).pop() || url.hostname.split('.')[0];
  const title = titleCase(decodeURIComponent(slug)) || `مقاله از ${url.hostname}`;
  const topic = store.rankedTopics()[0]?.id || 'ai-agents';
  const id = `u${Date.now().toString(36)}`;
  const host = url.hostname.replace(/^www\./, '');

  return {
    id, title, author: 'نویسنده نامشخص', date: new Date().toISOString().slice(0, 10),
    minutes: 7, topic, relevance: 78, source: host,
    imported: true, importedFrom: url.href,
    summary: `واردشده از ${host}. متن استخراج‌شده خلاصه و در برابر کتابخانه شما نمایه شده است.`,
    tldr: `این مقاله از ${host} وارد شد. متن استخراج‌شده‌اش اینجا خلاصه شده؛ هرجا منبع کم‌مایه باشد، این خلاصه هم کم‌مایه می‌ماند و شکاف را پر نمی‌کند.`,
    reasons: [`با موضوع «${topicName(topic)}» شما هم‌خوان است`, 'خودتان واردش کردید', 'تازه به کتابخانه شما افزوده شد'],
    insights: [
      { h: 'استخراج موفق بود', p: 'متن خوانای صفحه بازیابی و در برابر کتابخانه فعلی شما نمایه شد.' },
      { h: 'در یک موضوع قرار گرفت', p: `بر پایه متن استخراج‌شده و علاقه‌مندی‌های فعلی شما در «${topicName(topic)}» طبقه‌بندی شد.` },
      { h: 'اتصال‌ها در انتظارند', p: 'پیوند به مقاله‌های مرتبط با رسیدن مطالب بیشتر درباره این موضوع بهتر می‌شود.' },
    ],
    why: `خودتان این را اضافه کردید، پس صرف‌نظر از امتیاز در کتابخانه شما می‌ماند. در «${topicName(topic)}» قرار گرفته که در حال حاضر پروزن‌ترین موضوع شماست.`,
    changed: 'تغییر معناداری تشخیص داده نشد — این نخستین نسخه این مقاله در کتابخانه شماست.',
    body: [
      `این مقاله برای تحلیل از ${host} وارد شد.`,
      '## محتوای استخراج‌شده',
      'در نسخه عملیاتی، این بخش متن بازیابی‌شده مقاله را در بر می‌گیرد؛ بدون منو، تبلیغات و عناصر اضافی.',
      'در این نمونه اولیه هیچ درخواست شبکه‌ای فرستاده نمی‌شود، پس این متن جای‌نگهدار است نه متنی ساختگی. باقی این صفحه — قرارگرفتن در موضوع، امتیاز ارتباط و پیوند با کتابخانه شما — دقیقاً همان‌طور رفتار می‌کند که با محتوای واقعی می‌کرد.',
      '> جایی که منبع ساکت است، محصول هم ساکت می‌ماند.',
    ],
    original: [
      `This article was imported from ${host} for analysis.`,
      '## Extracted content',
      'In the production system this section holds the article text recovered by the extractor, with boilerplate, navigation and advertising removed.',
      '> Where the source is silent, the product stays silent.',
    ],
  };
}

/* --------------------------------------------------------------- Website */
export function openAddWebsite() {
  openModal({
    title: 'یک سایت را به منبع هوشمندی شخصی خود تبدیل کنید',
    subtitle: 'سایت را نقشه‌برداری می‌کنیم، مقاله‌های هم‌خوان با موضوع‌های شما را پیدا می‌کنیم و پایشش را ادامه می‌دهیم.',
    body: `
      <div class="field">
        <label for="siteUrl">نشانی سایت</label>
        <input class="input input-lg latin" id="siteUrl" placeholder="https://technologyreview.com"
          data-act-enter="add:site-run" autocomplete="off">
        <p class="xs muted-2">نمونه اولیه: هر دامنه معتبری کار می‌کند. برای دیدن حالت شکست «blocked» را در نشانی بگذارید.</p>
      </div>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">انصراف</button>
      <button class="btn btn-primary" data-act="add:site-run">تحلیل سایت</button>`,
    wide: true,
  });
}

function runWebsite() {
  const raw = (document.getElementById('siteUrl')?.value || '').trim();
  const url = validUrl(raw);

  if (!url || /blocked|fail/i.test(raw)) {
    setModal({
      title: 'Analysis failed',
      subtitle: '',
      body: errorState({
        title: 'نتوانستیم به این سایت دسترسی پیدا کنیم.',
        reasons: ['سایت در دسترس نیست', 'محتوا بسته است', 'نشانی نامعتبر', 'نیاز به ورود دارد'],
        actions: `
          <button class="btn" data-act="add:open" data-kind="website">نشانی دیگری امتحان کنید</button>
          <button class="btn btn-ghost" data-act="add:open" data-kind="article">یک مقاله را دستی اضافه کنید</button>`,
      }),
      foot: '<button class="btn btn-ghost" data-act="modal:close">بستن</button>',
    });
    return;
  }

  const host = url.hostname.replace(/^www\./, '');
  const total = 400 + Math.floor(Math.random() * 1400);
  const categories = [
    { name: 'هوش مصنوعی', count: Math.round(total * 0.34), tracked: true },
    { name: 'فناوری', count: Math.round(total * 0.31), tracked: true },
    { name: 'کسب‌وکار', count: Math.round(total * 0.17), tracked: false },
    { name: 'سایر', count: Math.round(total * 0.18), tracked: false },
  ];
  pending = { host, url: url.href, total, categories, frequency: 'روزانه' };

  setModal({
    title: 'در حال تحلیل سایت',
    subtitle: `نقشه‌برداری <b class="latin">${esc(host)}</b>.`,
    body: `
      <div id="addSteps"></div>
      <p class="xs muted-2 mt-4">کمی طول می‌کشد. اگر الان خارج شوید، کشف لغو می‌شود.</p>`,
    foot: '',
  });

  runSteps(document.getElementById('addSteps'), [
    { label: 'سایت پیدا شد', note: host },
    { label: 'نقشه سایت تشخیص داده شد', note: '/sitemap.xml' },
    { label: 'ساختار مقاله شناسایی شد', note: '' },
    { label: `${num(total)} مقاله کشف شد`, note: '' },
    { label: `${num(categories.length)} دسته پیدا شد`, note: '' },
  ], { stepMs: 700, onDone: showWebsiteConfig });
}

function showWebsiteConfig() {
  const p = pending;
  setModal({
    title: 'چه چیزی را پایش کنیم؟',
    subtitle: 'فقط دسته‌هایی که انتخاب می‌کنید جمع‌آوری می‌شوند. بقیه کاملاً نادیده گرفته می‌شود.',
    body: `
      <div class="row between wrap gap-4">
        <div>
          <span class="eyebrow">پیدا کردیم</span>
          <p class="h1 serif tnum mt-2">${num(p.total)}</p>
          <p class="small muted">مقاله در ${num(p.categories.length)} دسته</p>
        </div>
        <span class="badge badge-topic latin">${esc(p.host)}</span>
      </div>

      <div class="mt-6">
        <span class="eyebrow">دسته‌ها</span>
        <div class="mt-3">
          ${p.categories.map((c, i) => `
            <label class="settings-row" style="cursor:pointer">
              <span class="row gap-3">
                <input type="checkbox" data-cat-index="${i}" ${c.tracked ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px">
                <span>
                  <b>${esc(c.name)}</b>
                  <span class="xs muted" style="display:block">${num(c.count)} مقاله</span>
                </span>
              </span>
            </label>`).join('')}
        </div>
      </div>

      <div class="mt-6">
        <span class="eyebrow">دوره به‌روزرسانی</span>
        <div class="row wrap gap-2 mt-3">
          ${['روزانه', 'هفتگی'].map(f => `
            <button class="chip" data-act="add:site-freq" data-id="${f}" aria-pressed="${p.frequency === f}">${f}</button>`).join('')}
          <span class="chip" style="opacity:.5;cursor:not-allowed" title="پس از نسخه MVP در دسترس است">هر ۶ ساعت</span>
          <span class="chip" style="opacity:.5;cursor:not-allowed" title="پس از نسخه MVP در دسترس است">دستی</span>
        </div>
      </div>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">انصراف</button>
      <button class="btn btn-primary" data-act="add:site-confirm">ادامه</button>`,
  });

  modalBody()?.addEventListener('change', e => {
    const i = e.target.dataset?.catIndex;
    if (i != null) pending.categories[Number(i)].tracked = e.target.checked;
  });
}

function showWebsiteConfirm() {
  const p = pending;
  const tracked = p.categories.filter(c => c.tracked);
  if (!tracked.length) { toast('دست‌کم یک دسته انتخاب کنید', 'x'); return; }
  const relevant = tracked.reduce((n, c) => n + c.count, 0);

  setModal({
    title: 'تأیید این منبع',
    subtitle: '',
    body: `
      <div class="rows" style="border-top:0">
        ${[
          ['منبع', p.host],
          ['موضوع‌ها', tracked.map(c => c.name).join('، ')],
          ['پایش', p.frequency],
          ['مقاله‌ها', `${num(relevant)} مقاله مرتبط`],
        ].map(([k, v]) => `
          <div class="settings-row">
            <span class="eyebrow">${k}</span>
            <b class="small" style="text-align:right">${esc(v)}</b>
          </div>`).join('')}
      </div>
      <p class="xs muted-2 mt-5">بعداً می‌توانید همه این‌ها را از تنظیمات همان منبع متوقف یا تغییر دهید.</p>`,
    foot: `
      <button class="btn btn-ghost" data-act="add:site-back">بازگشت</button>
      <button class="btn btn-accent" data-act="add:site-start">شروع پایش</button>`,
  });
}

function startMonitoring() {
  const p = pending;
  const tracked = p.categories.filter(c => c.tracked);
  const relevant = tracked.reduce((n, c) => n + c.count, 0);
  const id = `s${Date.now().toString(36)}`;

  store.addSource({
    id, name: titleCase(p.host.split('.')[0]), domain: p.host,
    total: p.total, relevant, newThisWeek: 0, lastChecked: 'just now',
    status: 'monitoring', frequency: p.frequency,
    topics: store.rankedTopics().slice(0, 2).map(t => t.id),
    categories: p.categories,
  });

  pending = null;
  closeModal();
  location.hash = `#/sources/${id}`;
  toast('پایش آغاز شد');
}

/* ------------------------------------------------------------------- PDF */
export function openAddPdf() {
  openModal({
    title: 'بارگذاری سند',
    subtitle: 'فایل‌های PDF دقیقاً مثل مقاله‌های وب استخراج، خلاصه و نمایه می‌شوند.',
    body: `
      <label class="state center" style="cursor:pointer;width:100%" for="pdfFile">
        ${icon('file', 24)}
        <b>یک PDF انتخاب کنید</b>
        <span class="small muted">یا اینجا رهایش کنید — در این نمونه چیزی بارگذاری نمی‌شود</span>
        <input id="pdfFile" type="file" accept="application/pdf" class="sr-only">
      </label>
      <p class="xs muted-2 mt-4" id="pdfName"></p>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">انصراف</button>
      <button class="btn btn-primary" data-act="add:pdf-run">تحلیل سند</button>`,
  });

  modalBody()?.addEventListener('change', e => {
    if (e.target.id === 'pdfFile') {
      const el = document.getElementById('pdfName');
      if (el) el.textContent = e.target.files?.[0] ? `انتخاب‌شده: ${e.target.files[0].name}` : '';
    }
  });
}

function runPdf() {
  const file = document.getElementById('pdfFile')?.files?.[0];
  const name = file ? file.name : 'document.pdf';

  setModal({
    title: 'در حال تحلیل سند',
    subtitle: `استخراج <b class="latin">${esc(name)}</b>.`,
    body: '<div id="addSteps"></div>', foot: '',
  });

  runSteps(document.getElementById('addSteps'), [
    { label: 'خواندن سند', note: name },
    { label: 'استخراج متن', note: 'لایه متنی پیدا شد' },
    { label: 'درک محتوا', note: '' },
    { label: 'تولید نکته‌های کلیدی', note: '' },
  ], {
    onDone: () => {
      const topic = store.rankedTopics()[0]?.id || 'ai-agents';
      const id = `p${Date.now().toString(36)}`;
      store.addArticle({
        id, title: titleCase(name), author: 'سند بارگذاری‌شده',
        date: new Date().toISOString().slice(0, 10), minutes: 12, topic, relevance: 74,
        source: 'upload', imported: true,
        summary: 'سند بارگذاری‌شده، استخراج و در برابر کتابخانه شما نمایه شد.',
        tldr: 'این سند بارگذاری و متنش استخراج شد. خلاصه تنها آنچه را که در خود سند هست بازتاب می‌دهد.',
        reasons: ['این سند را خودتان بارگذاری کردید', `در «${topicName(topic)}» قرار گرفت`],
        insights: [
          { h: 'لایه متنی استخراج شد', p: 'سند متن قابل انتخاب داشت، پس نیازی به OCR نبود.' },
          { h: 'در کتابخانه شما نمایه شد', p: 'حالا می‌توان آن را جست‌وجو کرد و «پژوهش» می‌تواند در کنار مقاله‌های شما از آن استفاده کند.' },
        ],
        why: 'این را خودتان بارگذاری کردید، پس صرف‌نظر از امتیاز ارتباط نگه داشته می‌شود.',
        changed: 'تغییر معناداری تشخیص داده نشد — نخستین نسخه در کتابخانه شما.',
        body: ['این سند بارگذاری‌شده استخراج و نمایه شده است.', '## محتوای استخراج‌شده', 'در نسخه عملیاتی این بخش متن سند را در بر می‌گیرد. نمونه اولیه فایل شما را نمی‌خواند، پس چیزی از خودش نمی‌سازد.'],
        original: ['This uploaded document has been extracted and indexed.'],
      });
      setModal({
        title: 'سند تحلیل شد',
        subtitle: '',
        body: `<div class="steps">${['استخراج متن', 'خلاصه', 'نکته‌های کلیدی', 'نمایه‌شدن در کتابخانه'].map(x =>
          `<div class="step" data-state="done"><span class="step-mark">${icon('check', 10)}</span><span>${x}</span></div>`).join('')}</div>`,
        foot: `
          <button class="btn btn-ghost" data-act="modal:close">تمام</button>
          <button class="btn btn-primary" data-act="add:done-article" data-id="${id}">باز کردن سند</button>`,
      });
    },
  });
}

/* ----------------------------------------------------------------- Topic */
export function openAddTopic() {
  openModal({
    title: 'دنبال‌کردن یک موضوع',
    subtitle: 'موضوع‌ها از مرز منابع عبور می‌کنند. همه منابع پایش‌شده را برای مطالب هم‌خوان می‌گردیم.',
    body: `
      <div class="field">
        <label for="topicName">موضوع</label>
        <input class="input input-lg" id="topicName" placeholder="مثلاً عامل‌های هوش مصنوعی" data-act-enter="add:topic-run" autocomplete="off">
      </div>
      <div class="mt-5">
        <span class="eyebrow">یا یکی از موجودها را انتخاب کنید</span>
        <div class="row wrap gap-2 mt-3">
          ${TOPICS.map(t => `<button class="chip" data-act="add:topic-pick" data-id="${t.id}"
            aria-pressed="${store.get().followedTopics.includes(t.id)}">${esc(t.name)}</button>`).join('')}
        </div>
      </div>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">انصراف</button>
      <button class="btn btn-primary" data-act="add:topic-run">دنبال کردن</button>`,
  });
}

/* --------------------------------------------------------------- Actions */
export function registerAddActions(rerender) {
  const open = kind => ({
    article: openAddArticle, website: openAddWebsite,
    pdf: openAddPdf, topic: openAddTopic,
  }[kind] || openAddMenu)();

  on('add:menu', openAddMenu);
  on('add:open', ({ kind }) => open(kind));
  window.addEventListener('add:open', e => open(e.detail?.kind));

  on('add:article-run', runArticle);
  on('add:site-run', runWebsite);
  on('add:pdf-run', runPdf);

  on('add:site-freq', ({ id }) => { pending.frequency = id; showWebsiteConfig(); });
  on('add:site-confirm', showWebsiteConfirm);
  on('add:site-back', showWebsiteConfig);
  on('add:site-start', startMonitoring);

  on('add:done-article', ({ id }) => { closeModal(); location.hash = `#/article/${id}`; });

  on('add:topic-run', () => {
    const name = (document.getElementById('topicName')?.value || '').trim();
    if (!name) return;
    const existing = TOPICS.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existing) store.toggleFollowTopic(existing.id);
    else {
      const interests = [...new Set([...store.get().interests, name])];
      store.set({ interests });
      store.signal('followTopic', { label: name });
    }
    closeModal();
    toast(`«${name}» دنبال می‌شود`);
    rerender();
  });

  on('add:topic-pick', ({ id }) => {
    const now = store.toggleFollowTopic(id);
    toast(now ? `«${topicName(id)}» دنبال می‌شود` : `دنبال‌کردن «${topicName(id)}» متوقف شد`);
    closeModal();
    rerender();
  });
}
