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
    title: 'چه چیزی می‌خواهید اضافه کنید؟',
    subtitle: 'یکی را انتخاب کنید. بقیه کارها با ماست.',
    body: `
      <div class="grid grid-2">
        ${[
          ['article', 'link', 'یک مقاله', 'لینک مقاله را اینجا بگذارید'],
          ['website', 'globe', 'یک سایت', 'هر روز مقاله‌های تازه‌اش را می‌آوریم'],
          ['pdf', 'file', 'یک فایل PDF', 'فایل را از کامپیوترتان انتخاب کنید'],
          ['topic', 'hash', 'یک موضوع', 'در همه منبع‌هایتان دنبالش می‌گردیم'],
        ].map(([kind, ic, name, hint]) => `
          <button class="choice" data-act="add:open" data-kind="${kind}">
            <span class="ico">${icon(ic, 20)}</span>
            <b>${name}</b>
            <span class="small muted">${hint}</span>
          </button>`).join('')}
      </div>`,
  });
}

/* --------------------------------------------------------------- Article */
export function openAddArticle() {
  openModal({
    title: 'یک مقاله اضافه کنید',
    subtitle: 'لینک مقاله را بدهید تا آن را بخوانیم، خلاصه کنیم و به فارسی ترجمه کنیم.',
    body: `
      <div class="field">
        <label for="artUrl">لینک مقاله</label>
        <input class="input input-lg latin" id="artUrl" placeholder="https://example.com/article"
          data-act-enter="add:article-run" autocomplete="off">
        <p class="xs muted-2">این نمونه آزمایشی است و هر لینکی را قبول می‌کند. اگر کلمه blocked داخل لینک باشد، پیام خطا را نشان می‌دهیم.</p>
      </div>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">انصراف</button>
      <button class="btn btn-primary" data-act="add:article-run">بخوان و خلاصه کن</button>`,
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
        title: url ? 'نتوانستیم این مقاله را باز کنیم' : 'این لینک درست به نظر نمی‌رسد',
        reasons: url
          ? ['مقاله فقط برای مشترک‌های سایت باز است', 'برای دیدنش باید وارد حساب شوید', 'سایت اجازه خواندن خودکار نمی‌دهد']
          : ['لینک ناقص است', 'لینک را کامل و با https:// وارد کنید'],
        actions: `
          <button class="btn" data-act="add:open" data-kind="article">لینک دیگری امتحان کنید</button>
          <button class="btn btn-ghost" data-act="add:open" data-kind="pdf">فایل مقاله را خودتان بفرستید</button>`,
      }),
      foot: '<button class="btn btn-ghost" data-act="modal:close">بستن</button>',
    });
    return;
  }

  setModal({
    title: 'در حال خواندن مقاله…',
    subtitle: `از سایت <b class="latin">${esc(url.hostname)}</b>. چند ثانیه طول می‌کشد.`,
    body: '<div id="addSteps"></div>', foot: '',
  });

  runSteps(document.getElementById('addSteps'), [
    { label: 'باز کردن صفحه', note: url.hostname },
    { label: 'جدا کردن متن مقاله از بقیه صفحه', note: 'انجام شد' },
    { label: 'خواندن مقاله', note: '' },
    { label: 'نوشتن خلاصه و نکته‌های مهم', note: '' },
    { label: 'پیدا کردن ارتباطش با مقاله‌های دیگر شما', note: '' },
  ], {
    onDone: () => {
      const a = buildArticle(url);
      store.addArticle(a);
      setModal({
        title: 'مقاله آماده است',
        subtitle: '',
        body: `
          <div class="steps">
            ${['خلاصه کوتاه', 'نکته‌های مهم', 'دسته‌بندی موضوعی', 'ترجمه فارسی', 'مقاله‌های شبیه این'].map(x => `
              <div class="step" data-state="done">
                <span class="step-mark">${icon('check', 10)}</span><span>${x}</span>
              </div>`).join('')}
          </div>
          <div class="card card-tight mt-5">
            <span class="tag tag-red">${esc(topicName(a.topic))}</span>
            <p class="editorial mt-3" style="font-size:1.1875rem;line-height:1.55">${esc(a.title)}</p>
            <p class="xs muted mt-2"><span class="latin">${esc(url.hostname)}</span> · ${num(a.minutes)} دقیقه مطالعه · ٪${num(a.relevance)} مرتبط</p>
          </div>`,
        foot: `
          <button class="btn btn-ghost" data-act="add:open" data-kind="article">یکی دیگر اضافه کنید</button>
          <button class="btn btn-primary" data-act="add:done-article" data-id="${a.id}">بازش کنید</button>`,
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
    title: 'یک سایت اضافه کنید',
    subtitle: 'کل سایت را می‌گردیم، مقاله‌های مرتبط با شما را جدا می‌کنیم، و بعد هر روز سراغش می‌رویم.',
    body: `
      <div class="field">
        <label for="siteUrl">نشانی سایت</label>
        <input class="input input-lg latin" id="siteUrl" placeholder="https://technologyreview.com"
          data-act-enter="add:site-run" autocomplete="off">
        <p class="xs muted-2">این نمونه آزمایشی است و هر نشانی‌ای را قبول می‌کند. اگر کلمه blocked داخل نشانی باشد، پیام خطا را نشان می‌دهیم.</p>
      </div>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">انصراف</button>
      <button class="btn btn-primary" data-act="add:site-run">سایت را بگرد</button>`,
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
        title: 'نتوانستیم این سایت را باز کنیم',
        reasons: ['سایت در دسترس نیست', 'مقاله‌هایش برای عموم باز نیست', 'نشانی را اشتباه وارد کرده‌اید', 'برای دیدن مقاله‌ها باید وارد حساب شوید'],
        actions: `
          <button class="btn" data-act="add:open" data-kind="website">نشانی دیگری امتحان کنید</button>
          <button class="btn btn-ghost" data-act="add:open" data-kind="article">به‌جایش یک مقاله تکی اضافه کنید</button>`,
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
    title: 'در حال گشتن سایت…',
    subtitle: `<b class="latin">${esc(host)}</b>`,
    body: `
      <div id="addSteps"></div>
      <p class="xs muted-2 mt-4">چند لحظه صبر کنید. اگر این پنجره را ببندید، کار از اول شروع می‌شود.</p>`,
    foot: '',
  });

  runSteps(document.getElementById('addSteps'), [
    { label: 'سایت پیدا شد', note: host },
    { label: 'فهرست صفحه‌های سایت گرفته شد', note: '' },
    { label: 'مشخص شد مقاله‌ها کجای سایت هستند', note: '' },
    { label: `${num(total)} مقاله پیدا شد`, note: '' },
    { label: `${num(categories.length)} دسته پیدا شد`, note: '' },
  ], { stepMs: 700, onDone: showWebsiteConfig });
}

function showWebsiteConfig() {
  const p = pending;
  setModal({
    title: 'کدام دسته‌ها را می‌خواهید؟',
    subtitle: 'فقط مقاله‌های دسته‌هایی را می‌آوریم که تیک بزنید. بقیه را اصلاً نگاه نمی‌کنیم.',
    body: `
      <div class="row between wrap gap-4">
        <div>
          <span class="label">در این سایت</span>
          <p class="h1 serif tnum mt-2">${num(p.total)}</p>
          <p class="small muted">مقاله در ${num(p.categories.length)} دسته</p>
        </div>
        <span class="tag tag-red latin">${esc(p.host)}</span>
      </div>

      <div class="mt-6">
        <span class="label">دسته‌ها</span>
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
        <span class="label">هر چند وقت چک کنیم؟</span>
        <div class="row wrap gap-2 mt-3">
          ${['روزانه', 'هفتگی'].map(f => `
            <button class="chip" data-act="add:site-freq" data-id="${f}" aria-pressed="${p.frequency === f}">${f}</button>`).join('')}
          <span class="chip" style="opacity:.5;cursor:not-allowed" title="بعداً اضافه می‌شود">هر ۶ ساعت</span>
          <span class="chip" style="opacity:.5;cursor:not-allowed" title="بعداً اضافه می‌شود">دستی</span>
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
  if (!tracked.length) { toast('حداقل یکی را تیک بزنید', 'x'); return; }
  const relevant = tracked.reduce((n, c) => n + c.count, 0);

  setModal({
    title: 'قبل از شروع، یک مرور',
    subtitle: '',
    body: `
      <div class="rows" style="border-top:0">
        ${[
          ['سایت', p.host],
          ['دسته‌ها', tracked.map(c => c.name).join('، ')],
          ['چک کردن', p.frequency],
          ['تعداد مقاله', `${num(relevant)} تا`],
        ].map(([k, v]) => `
          <div class="settings-row">
            <span class="label">${k}</span>
            <b class="small" style="text-align:right">${esc(v)}</b>
          </div>`).join('')}
      </div>
      <p class="xs muted-2 mt-5">هر وقت خواستید می‌توانید این تنظیمات را عوض کنید یا پایش را متوقف کنید.</p>`,
    foot: `
      <button class="btn btn-ghost" data-act="add:site-back">برگردید</button>
      <button class="btn btn-accent" data-act="add:site-start">شروع کنید</button>`,
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
  toast('شروع کردیم. از فردا مقاله‌های این سایت را برایتان می‌آوریم.');
}

/* ------------------------------------------------------------------- PDF */
export function openAddPdf() {
  openModal({
    title: 'یک فایل PDF بفرستید',
    subtitle: 'فایل را هم مثل مقاله‌های وب می‌خوانیم و خلاصه می‌کنیم.',
    body: `
      <label class="state center" style="cursor:pointer;width:100%" for="pdfFile">
        ${icon('file', 24)}
        <b>فایل را انتخاب کنید</b>
        <span class="small muted">یا فایل را همین‌جا رها کنید. در این نمونه آزمایشی چیزی آپلود نمی‌شود.</span>
        <input id="pdfFile" type="file" accept="application/pdf" class="sr-only">
      </label>
      <p class="xs muted-2 mt-4" id="pdfName"></p>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">انصراف</button>
      <button class="btn btn-primary" data-act="add:pdf-run">بخوان و خلاصه کن</button>`,
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
    title: 'در حال خواندن فایل…',
    subtitle: `<b class="latin">${esc(name)}</b>`,
    body: '<div id="addSteps"></div>', foot: '',
  });

  runSteps(document.getElementById('addSteps'), [
    { label: 'باز کردن فایل', note: name },
    { label: 'بیرون کشیدن متن از فایل', note: 'انجام شد' },
    { label: 'خواندن متن', note: '' },
    { label: 'نوشتن خلاصه و نکته‌های مهم', note: '' },
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
        title: 'مقاله آماده است',
        subtitle: '',
        body: `<div class="steps">${['متن فایل جدا شد', 'خلاصه نوشته شد', 'نکته‌های مهم درآمد', 'در کتابخانه ذخیره شد'].map(x =>
          `<div class="step" data-state="done"><span class="step-mark">${icon('check', 10)}</span><span>${x}</span></div>`).join('')}</div>`,
        foot: `
          <button class="btn btn-ghost" data-act="modal:close">تمام</button>
          <button class="btn btn-primary" data-act="add:done-article" data-id="${id}">بازش کنید</button>`,
      });
    },
  });
}

/* ----------------------------------------------------------------- Topic */
export function openAddTopic() {
  openModal({
    title: 'یک موضوع دنبال کنید',
    subtitle: 'از این به بعد در همه منبع‌هایتان دنبال این موضوع می‌گردیم.',
    body: `
      <div class="field">
        <label for="topicName">موضوع</label>
        <input class="input input-lg" id="topicName" placeholder="مثلاً: هوش مصنوعی در پزشکی" data-act-enter="add:topic-run" autocomplete="off">
      </div>
      <div class="mt-5">
        <span class="label">یا یکی از این‌ها</span>
        <div class="row wrap gap-2 mt-3">
          ${TOPICS.map(t => `<button class="chip" data-act="add:topic-pick" data-id="${t.id}"
            aria-pressed="${store.get().followedTopics.includes(t.id)}">${esc(t.name)}</button>`).join('')}
        </div>
      </div>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">انصراف</button>
      <button class="btn btn-primary" data-act="add:topic-run">دنبالش کنید</button>`,
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
    toast(`«${name}» را دنبال می‌کنیم`);
    rerender();
  });

  on('add:topic-pick', ({ id }) => {
    const now = store.toggleFollowTopic(id);
    toast(now ? `«${topicName(id)}» را دنبال می‌کنیم` : `دیگر دنبالش نمی‌کنیم`);
    closeModal();
    rerender();
  });
}
