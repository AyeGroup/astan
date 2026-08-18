/* §17–22 Add flows · §47 Loading states · §48 Error states */
import { esc, icon, on, toast, openModal, setModal, closeModal, modalBody, runSteps } from '../ui.js';
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
    title: 'Add to your research',
    subtitle: 'One source is enough to start. Everything is processed the same way.',
    body: `
      <div class="grid grid-2">
        ${[
          ['article', 'file', 'Article', 'Paste an article URL'],
          ['website', 'globe', 'Website', 'Let AI monitor a website'],
          ['pdf', 'file', 'PDF', 'Upload a document'],
          ['topic', 'hash', 'Topic', 'Follow a subject across sources'],
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
    title: 'Add an article',
    subtitle: 'We fetch it, extract the text, and build a summary, insights and a translation.',
    body: `
      <div class="field">
        <label for="artUrl">Article URL</label>
        <input class="input input-lg" id="artUrl" placeholder="https://example.com/article"
          data-act-enter="add:article-run" autocomplete="off">
        <p class="xs muted-2">Prototype: any valid URL works. Include the word "blocked" to see the error state.</p>
      </div>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">Cancel</button>
      <button class="btn btn-primary" data-act="add:article-run">Analyze article</button>`,
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
        title: url ? "We couldn't access this article." : "That doesn't look like a valid URL.",
        reasons: url
          ? ['Content blocked to non-subscribers', 'Page requires login', 'Site refused automated access']
          : ['Missing or malformed address', 'Try a full link starting with https://'],
        actions: `
          <button class="btn" data-act="add:open" data-kind="article">Try another URL</button>
          <button class="btn btn-ghost" data-act="add:open" data-kind="pdf">Add the document manually</button>`,
      }),
      foot: '<button class="btn btn-ghost" data-act="modal:close">Close</button>',
    });
    return;
  }

  setModal({
    title: 'Analyzing article',
    subtitle: `Reading <b>${esc(url.hostname)}</b>. This usually takes a few seconds.`,
    body: '<div id="addSteps"></div>', foot: '',
  });

  runSteps(document.getElementById('addSteps'), [
    { label: 'Fetching article', note: url.hostname },
    { label: 'Extracting content', note: 'readable text found' },
    { label: 'Understanding article', note: '' },
    { label: 'Generating insights', note: '' },
    { label: 'Connecting related research', note: '' },
  ], {
    onDone: () => {
      const a = buildArticle(url);
      store.addArticle(a);
      setModal({
        title: 'Article analyzed successfully',
        subtitle: '',
        body: `
          <div class="steps">
            ${['Summary', 'Key insights', 'Topics', 'Translation', 'Related articles'].map(x => `
              <div class="step" data-state="done">
                <span class="step-mark">${icon('check', 10)}</span><span>${x}</span>
              </div>`).join('')}
          </div>
          <div class="card card-tight mt-5">
            <span class="badge badge-topic">${esc(topicName(a.topic))}</span>
            <p class="h3 mt-3" style="font-family:var(--font-serif);font-weight:400">${esc(a.title)}</p>
            <p class="xs muted mt-2">${esc(url.hostname)} · ${a.minutes} min read · ${a.relevance}% relevant</p>
          </div>`,
        foot: `
          <button class="btn btn-ghost" data-act="add:open" data-kind="article">Add another</button>
          <button class="btn btn-primary" data-act="add:done-article" data-id="${a.id}">Open article</button>`,
      });
    },
  });
}

function buildArticle(url) {
  const slug = url.pathname.split('/').filter(Boolean).pop() || url.hostname.split('.')[0];
  const title = titleCase(decodeURIComponent(slug)) || `Article from ${url.hostname}`;
  const topic = store.rankedTopics()[0]?.id || 'ai-agents';
  const id = `u${Date.now().toString(36)}`;
  const host = url.hostname.replace(/^www\./, '');

  return {
    id, title, author: 'Unknown author', date: new Date().toISOString().slice(0, 10),
    minutes: 7, topic, relevance: 78, source: host,
    imported: true, importedFrom: url.href,
    summary: `Imported from ${host}. The extracted text has been summarised and indexed against your library.`,
    tldr: `This article was imported from ${host}. Its extracted text is summarised here; where the source is thin, this summary stays thin rather than filling gaps.`,
    reasons: [`Matches your ${topicName(topic)} topic`, 'Imported by you', 'Newly added to your library'],
    insights: [
      { h: 'Extracted successfully', p: 'Readable body text was recovered from the page and indexed against your existing library.' },
      { h: 'Placed in a topic', p: `Classified as ${topicName(topic)} based on the extracted text and your current interests.` },
      { h: 'Connections pending', p: 'Related-article links improve as more material on this subject arrives.' },
    ],
    why: `You added this yourself, so it is in your library regardless of score. It has been placed in ${topicName(topic)}, which is currently your highest-weighted topic.`,
    changed: 'No significant change detected — this is the first version of this article in your library.',
    body: [
      `This article was imported from ${host} for analysis.`,
      '## Extracted content',
      'In the production system this section holds the article text recovered by the extractor, with boilerplate, navigation and advertising removed.',
      'In this prototype no network request is made, so the body is a placeholder rather than fabricated text. Everything else in this screen — topic placement, relevance, and the connection to your library — behaves exactly as it would with real content.',
      '> Where the source is silent, the product stays silent.',
    ],
    fa: [
      `این مقاله برای تحلیل از ${host} وارد شد.`,
      '## محتوای استخراج‌شده',
      'در نسخه عملیاتی، این بخش متن بازیابی‌شده مقاله را در بر می‌گیرد؛ بدون منو، تبلیغات و عناصر اضافی.',
      '> جایی که منبع ساکت است، محصول هم ساکت می‌ماند.',
    ],
  };
}

/* --------------------------------------------------------------- Website */
export function openAddWebsite() {
  openModal({
    title: 'Turn a website into your personal intelligence source',
    subtitle: 'We map the site, find the articles that fit your topics, and keep watching it for you.',
    body: `
      <div class="field">
        <label for="siteUrl">Website URL</label>
        <input class="input input-lg" id="siteUrl" placeholder="https://technologyreview.com"
          data-act-enter="add:site-run" autocomplete="off">
        <p class="xs muted-2">Prototype: any valid domain works. Include "blocked" to see the failure state.</p>
      </div>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">Cancel</button>
      <button class="btn btn-primary" data-act="add:site-run">Analyze website</button>`,
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
        title: "We couldn't access this website.",
        reasons: ['Website unavailable', 'Content blocked', 'Invalid URL', 'Login required'],
        actions: `
          <button class="btn" data-act="add:open" data-kind="website">Try another URL</button>
          <button class="btn btn-ghost" data-act="add:open" data-kind="article">Add an article manually</button>`,
      }),
      foot: '<button class="btn btn-ghost" data-act="modal:close">Close</button>',
    });
    return;
  }

  const host = url.hostname.replace(/^www\./, '');
  const total = 400 + Math.floor(Math.random() * 1400);
  const categories = [
    { name: 'AI', count: Math.round(total * 0.34), tracked: true },
    { name: 'Technology', count: Math.round(total * 0.31), tracked: true },
    { name: 'Business', count: Math.round(total * 0.17), tracked: false },
    { name: 'Other', count: Math.round(total * 0.18), tracked: false },
  ];
  pending = { host, url: url.href, total, categories, frequency: 'Daily' };

  setModal({
    title: 'Analyzing website',
    subtitle: `Mapping <b>${esc(host)}</b>.`,
    body: `
      <div id="addSteps"></div>
      <p class="xs muted-2 mt-4">This takes a moment. Leaving now cancels the discovery.</p>`,
    foot: '',
  });

  runSteps(document.getElementById('addSteps'), [
    { label: 'Website found', note: host },
    { label: 'Sitemap detected', note: '/sitemap.xml' },
    { label: 'Article structure identified', note: '' },
    { label: `${total.toLocaleString('en-GB')} articles discovered`, note: '' },
    { label: `${categories.length} categories found`, note: '' },
  ], { stepMs: 700, onDone: showWebsiteConfig });
}

function showWebsiteConfig() {
  const p = pending;
  setModal({
    title: 'What should we track?',
    subtitle: 'Only the categories you pick are collected. The rest is ignored entirely.',
    body: `
      <div class="row between wrap gap-4">
        <div>
          <span class="eyebrow">We found</span>
          <p class="h1 serif tnum mt-2">${p.total.toLocaleString('en-GB')}</p>
          <p class="small muted">articles across ${p.categories.length} categories</p>
        </div>
        <span class="badge badge-topic">${esc(p.host)}</span>
      </div>

      <div class="mt-6">
        <span class="eyebrow">Categories</span>
        <div class="mt-3">
          ${p.categories.map((c, i) => `
            <label class="settings-row" style="cursor:pointer">
              <span class="row gap-3">
                <input type="checkbox" data-cat-index="${i}" ${c.tracked ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px">
                <span>
                  <b>${esc(c.name)}</b>
                  <span class="xs muted" style="display:block">${c.count.toLocaleString('en-GB')} articles</span>
                </span>
              </span>
            </label>`).join('')}
        </div>
      </div>

      <div class="mt-6">
        <span class="eyebrow">Update frequency</span>
        <div class="row wrap gap-2 mt-3">
          ${['Daily', 'Weekly'].map(f => `
            <button class="chip" data-act="add:site-freq" data-id="${f}" aria-pressed="${p.frequency === f}">${f}</button>`).join('')}
          <span class="chip" style="opacity:.5;cursor:not-allowed" title="Available after MVP">Every 6 hours</span>
          <span class="chip" style="opacity:.5;cursor:not-allowed" title="Available after MVP">Manual</span>
        </div>
      </div>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">Cancel</button>
      <button class="btn btn-primary" data-act="add:site-confirm">Continue</button>`,
  });

  modalBody()?.addEventListener('change', e => {
    const i = e.target.dataset?.catIndex;
    if (i != null) pending.categories[Number(i)].tracked = e.target.checked;
  });
}

function showWebsiteConfirm() {
  const p = pending;
  const tracked = p.categories.filter(c => c.tracked);
  if (!tracked.length) { toast('Select at least one category', 'x'); return; }
  const relevant = tracked.reduce((n, c) => n + c.count, 0);

  setModal({
    title: 'Confirm this source',
    subtitle: '',
    body: `
      <div class="rows" style="border-top:0">
        ${[
          ['Source', p.host],
          ['Topics', tracked.map(c => c.name).join(', ')],
          ['Monitoring', p.frequency],
          ['Articles', `${relevant.toLocaleString('en-GB')} relevant articles`],
        ].map(([k, v]) => `
          <div class="settings-row">
            <span class="eyebrow">${k}</span>
            <b class="small" style="text-align:right">${esc(v)}</b>
          </div>`).join('')}
      </div>
      <p class="xs muted-2 mt-5">You can pause or change any of this later from the source's settings.</p>`,
    foot: `
      <button class="btn btn-ghost" data-act="add:site-back">Back</button>
      <button class="btn btn-accent" data-act="add:site-start">Start monitoring</button>`,
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
  toast('Monitoring started');
}

/* ------------------------------------------------------------------- PDF */
export function openAddPdf() {
  openModal({
    title: 'Upload a document',
    subtitle: 'PDFs are extracted, summarised and indexed exactly like web articles.',
    body: `
      <label class="state center" style="cursor:pointer;width:100%" for="pdfFile">
        ${icon('file', 24)}
        <b>Choose a PDF</b>
        <span class="small muted">or drop it here — nothing is uploaded in this prototype</span>
        <input id="pdfFile" type="file" accept="application/pdf" class="sr-only">
      </label>
      <p class="xs muted-2 mt-4" id="pdfName"></p>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">Cancel</button>
      <button class="btn btn-primary" data-act="add:pdf-run">Analyze document</button>`,
  });

  modalBody()?.addEventListener('change', e => {
    if (e.target.id === 'pdfFile') {
      const el = document.getElementById('pdfName');
      if (el) el.textContent = e.target.files?.[0] ? `Selected: ${e.target.files[0].name}` : '';
    }
  });
}

function runPdf() {
  const file = document.getElementById('pdfFile')?.files?.[0];
  const name = file ? file.name : 'document.pdf';

  setModal({
    title: 'Analyzing document',
    subtitle: `Extracting <b>${esc(name)}</b>.`,
    body: '<div id="addSteps"></div>', foot: '',
  });

  runSteps(document.getElementById('addSteps'), [
    { label: 'Reading document', note: name },
    { label: 'Extracting text', note: 'text layer found' },
    { label: 'Understanding content', note: '' },
    { label: 'Generating insights', note: '' },
  ], {
    onDone: () => {
      const topic = store.rankedTopics()[0]?.id || 'ai-agents';
      const id = `p${Date.now().toString(36)}`;
      store.addArticle({
        id, title: titleCase(name), author: 'Uploaded document',
        date: new Date().toISOString().slice(0, 10), minutes: 12, topic, relevance: 74,
        source: 'upload', imported: true,
        summary: `Uploaded document, extracted and indexed against your library.`,
        tldr: 'This document was uploaded and its text extracted. The summary reflects only what the document contains.',
        reasons: ['You uploaded this document', `Placed in ${topicName(topic)}`],
        insights: [
          { h: 'Text layer extracted', p: 'The document contained selectable text, so no OCR was needed.' },
          { h: 'Indexed to your library', p: 'It can now be searched and used by Research alongside your articles.' },
        ],
        why: 'You uploaded this, so it is kept regardless of relevance score.',
        changed: 'No significant change detected — first version in your library.',
        body: ['This uploaded document has been extracted and indexed.', '## Extracted content', 'In the production system this holds the document text. The prototype does not read your file, so nothing is invented here.'],
        fa: ['این سند بارگذاری‌شده استخراج و نمایه شده است.'],
      });
      setModal({
        title: 'Document analyzed',
        subtitle: '',
        body: `<div class="steps">${['Text extracted', 'Summary', 'Key insights', 'Indexed to Library'].map(x =>
          `<div class="step" data-state="done"><span class="step-mark">${icon('check', 10)}</span><span>${x}</span></div>`).join('')}</div>`,
        foot: `
          <button class="btn btn-ghost" data-act="modal:close">Done</button>
          <button class="btn btn-primary" data-act="add:done-article" data-id="${id}">Open document</button>`,
      });
    },
  });
}

/* ----------------------------------------------------------------- Topic */
export function openAddTopic() {
  openModal({
    title: 'Follow a topic',
    subtitle: 'Topics cut across sources. We watch every monitored source for material that fits.',
    body: `
      <div class="field">
        <label for="topicName">Topic</label>
        <input class="input input-lg" id="topicName" placeholder="e.g. AI Agents" data-act-enter="add:topic-run" autocomplete="off">
      </div>
      <div class="mt-5">
        <span class="eyebrow">Or pick an existing one</span>
        <div class="row wrap gap-2 mt-3">
          ${TOPICS.map(t => `<button class="chip" data-act="add:topic-pick" data-id="${t.id}"
            aria-pressed="${store.get().followedTopics.includes(t.id)}">${esc(t.name)}</button>`).join('')}
        </div>
      </div>`,
    foot: `
      <button class="btn btn-ghost" data-act="modal:close">Cancel</button>
      <button class="btn btn-primary" data-act="add:topic-run">Follow topic</button>`,
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
    toast(`Following ${name}`);
    rerender();
  });

  on('add:topic-pick', ({ id }) => {
    const now = store.toggleFollowTopic(id);
    toast(now ? `Following ${topicName(id)}` : `Unfollowed ${topicName(id)}`);
    closeModal();
    rerender();
  });
}
