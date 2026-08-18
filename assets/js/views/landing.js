/* §7 Landing · §8 Auth · §9–11 Onboarding — all "bare" layout screens. */
import { esc, icon, on, toast } from '../ui.js';
import * as store from '../store.js';
import { go } from '../router.js';
import { INTEREST_SEEDS } from '../data.js';

const brand = `
  <a class="brand" href="#/" style="padding:0">
    <span class="brand-mark">R</span>
    <span class="brand-name">Research</span>
  </a>`;

/* --------------------------------------------------------------- Landing */
export function landing() {
  return {
    layout: 'bare',
    title: 'Research — Know what matters',
    html: `
      <div class="landing">
        <nav class="landing-nav">
          ${brand}
          <div class="actions-inline">
            <button class="btn btn-ghost btn-icon" data-act="theme:toggle" aria-label="Toggle theme">${icon('moon')}</button>
            <button class="btn btn-ghost" data-act="nav:auth">Sign in</button>
            <button class="btn btn-primary" data-act="nav:auth">Start researching</button>
          </div>
        </nav>

        <header class="hero">
          <div class="hero-copy">
            <span class="eyebrow">Personal research intelligence</span>
            <h1 class="display">Know what matters.<br>Without reading everything.</h1>
            <p class="lead">Connect the websites, articles and topics you care about.
              AI finds, understands and recommends what matters to you.</p>
            <div class="actions-inline mt-2">
              <button class="btn btn-primary btn-lg" data-act="nav:auth">Start researching</button>
              <button class="btn btn-lg" data-act="landing:how">See how it works</button>
            </div>
            <p class="xs muted-2">No credit card. Your first insight in under a minute.</p>
          </div>

          <!-- §7 Hero visual: the real product surface, not decoration -->
          <div class="preview" aria-hidden="true">
            <div class="preview-bar">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              <span class="xs muted-2" style="margin-left:auto">Your Research Intelligence</span>
            </div>
            <div class="preview-body">
              <div>
                <span class="eyebrow">Tuesday</span>
                <p class="h2 serif mt-2">3 things you should know today</p>
              </div>
              <div>
                <div class="preview-row">
                  <span class="preview-score">94%</span>
                  <div>
                    <p style="font-family:var(--font-serif)">Agent tooling standardised faster than predicted</p>
                    <p class="xs muted mt-2">AI Agents · related to 8 articles you read</p>
                  </div>
                </div>
                <div class="preview-row">
                  <span class="preview-score">91%</span>
                  <div>
                    <p style="font-family:var(--font-serif)">AI Act enforcement began with paperwork</p>
                    <p class="xs muted mt-2">AI Regulation · from a source you monitor</p>
                  </div>
                </div>
                <div class="preview-row">
                  <span class="preview-score">83%</span>
                  <div>
                    <p style="font-family:var(--font-serif)">A study qualifies a claim you saved</p>
                    <p class="xs muted mt-2">Synthetic Data · contradicts your library</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section class="feature-grid" id="how">
          <div class="feature">
            <span class="num">01</span>
            <h3 class="h2">Add a source</h3>
            <p class="muted">An article, a PDF, or a whole website. We map its structure,
              find the articles that fit your topics, and ignore the rest.</p>
          </div>
          <div class="feature">
            <span class="num">02</span>
            <h3 class="h2">Get understanding</h3>
            <p class="muted">Summary, key insights, translation and — the part that matters —
              what changed compared with what you already know.</p>
          </div>
          <div class="feature">
            <span class="num">03</span>
            <h3 class="h2">Know why</h3>
            <p class="muted">Every recommendation explains itself and links to its source.
              When the sources are uncertain, so are we.</p>
          </div>
        </section>

        <section class="card" style="padding:var(--s-7)">
          <div class="row between wrap gap-5">
            <div style="max-width:44ch">
              <span class="eyebrow">The promise</span>
              <p class="h1 serif mt-3">Don't read everything.<br>Know what matters.</p>
            </div>
            <button class="btn btn-accent btn-lg" data-act="nav:auth">Create your account</button>
          </div>
        </section>

        <footer class="landing-foot">
          <span class="xs muted-2">Research · Personal Research Intelligence Platform</span>
          <span class="xs muted-2">Prototype — all content is sample data</span>
        </footer>
      </div>`,
  };
}

/* ------------------------------------------------------------------ Auth */
export function auth() {
  return {
    layout: 'bare',
    title: 'Sign in — Research',
    html: `
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="col gap-2" style="align-items:flex-start">
            ${brand}
            <h1 class="h1 mt-4">Create your account</h1>
            <p class="muted small">You'll pick your topics next, so you never land on an empty dashboard.</p>
          </div>

          <button class="btn btn-block btn-lg" data-act="auth:google">
            ${icon('globe')} Continue with Google
          </button>

          <div class="row gap-4">
            <span class="divider grow"></span>
            <span class="xs muted-2">or</span>
            <span class="divider grow"></span>
          </div>

          <form class="col gap-4" data-act="auth:submit">
            <div class="field">
              <label for="email">Email</label>
              <input class="input" id="email" name="email" type="email" placeholder="you@example.com" required>
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input class="input" id="password" name="password" type="password" placeholder="At least 8 characters" minlength="8" required>
            </div>
            <button class="btn btn-primary btn-lg btn-block" type="submit">Continue</button>
          </form>

          <p class="xs muted-2" style="text-align:center">
            Prototype — no account is created and nothing leaves your browser.
          </p>
        </div>
      </div>`,
  };
}

/* ------------------------------------------------------------ Onboarding */
const CUSTOM_KEY = '__custom__';
let draft = { interests: [], intent: null, query: '' };

const shell = (step, body, foot) => ({
  layout: 'bare',
  title: `Onboarding ${step} of 3 — Research`,
  html: `
    <div class="onboard-wrap">
      <header class="onboard-head">
        ${brand}
        <div class="row gap-4">
          <span class="xs muted">Step ${step} of 3</span>
          <span class="stepper">
            ${[1, 2, 3].map(i => `<i data-on="${i <= step}"></i>`).join('')}
          </span>
        </div>
      </header>
      <div class="onboard-body fade-in">
        ${body}
        <div class="row between wrap gap-4 mt-6" style="padding-top:var(--s-5);border-top:1px solid var(--line)">
          ${foot}
        </div>
      </div>
    </div>`,
});

export function onboarding(segments) {
  const step = Number(segments[0]) || 1;
  if (step === 2) return onboardStep2();
  if (step === 3) return onboardStep3();
  return onboardStep1();
}

function topicGrid() {
  const q = draft.query.trim().toLowerCase();
  const pool = [...new Set([...INTEREST_SEEDS, ...draft.interests])];
  const list = q ? pool.filter(t => t.toLowerCase().includes(q)) : pool;
  const canCreate = q && !pool.some(t => t.toLowerCase() === q);

  return `
    ${list.map(t => `
      <button class="topic-pill" data-act="onb:toggle" data-id="${esc(t)}"
        aria-pressed="${draft.interests.includes(t)}">
        <span>${esc(t)}</span>
        ${draft.interests.includes(t) ? icon('check', 14) : ''}
      </button>`).join('')}
    ${canCreate ? `
      <button class="topic-pill" data-act="onb:create" style="border-style:dashed">
        <span>${icon('plus', 14)} Create "${esc(draft.query)}"</span>
      </button>` : ''}
    ${!list.length && !canCreate ? '<p class="muted small">No topics match that search.</p>' : ''}`;
}

function onboardStep1() {
  return shell(1, `
    <h1 class="h1">What do you want to know more about?</h1>
    <p class="lead mt-3">Pick at least two. You can change these at any time, and your
      recommendations will keep adjusting as you read.</p>

    <div class="field mt-6">
      <input class="input input-lg" id="topicSearch" placeholder="Search topics…"
        value="${esc(draft.query)}" data-act-enter="onb:create" autocomplete="off">
    </div>

    <div class="topic-grid mt-4" id="topicGrid">${topicGrid()}</div>
  `, `
    <span class="small muted" data-topic-count>${draft.interests.length} selected</span>
    <button class="btn btn-primary btn-lg" data-act="onb:next" data-step="2"
      ${draft.interests.length < 1 ? 'disabled' : ''}>Continue</button>
  `);
}

function onboardStep2() {
  return shell(2, `
    <h1 class="h1">Add your first source</h1>
    <p class="lead mt-3">One source is enough to start. We'll process it while you finish setting up.</p>

    <div class="grid grid-3 mt-6">
      <button class="source-choice" data-act="onb:add" data-kind="article">
        ${icon('file', 20)}
        <b>Article</b>
        <span class="small muted">Paste an article URL</span>
      </button>
      <button class="source-choice" data-act="onb:add" data-kind="website">
        ${icon('globe', 20)}
        <b>Website</b>
        <span class="small muted">Let AI monitor a website</span>
      </button>
      <button class="source-choice" data-act="onb:add" data-kind="pdf">
        ${icon('file', 20)}
        <b>PDF</b>
        <span class="small muted">Upload a document</span>
      </button>
    </div>

    <p class="xs muted-2 mt-5">If you skip this, we'll still build a starter feed from
      public sources that match the topics you chose.</p>
  `, `
    <button class="btn btn-ghost" data-act="onb:next" data-step="3">I'll do this later</button>
    <button class="btn btn-primary btn-lg" data-act="onb:next" data-step="3">Continue</button>
  `);
}

const INTENTS = [
  { id: 'updated',  label: 'Stay updated',          hint: 'A short daily brief of what changed.' },
  { id: 'deep',     label: 'Research deeply',       hint: 'Fewer items, more synthesis and timelines.' },
  { id: 'industry', label: 'Follow an industry',    hint: 'Weighted toward companies, funding and policy.' },
  { id: 'learn',    label: 'Learn a topic',         hint: 'Foundational material first, then new work.' },
  { id: 'track',    label: 'Track specific websites', hint: 'Monitoring and change detection lead the feed.' },
];

function onboardStep3() {
  return shell(3, `
    <h1 class="h1">How do you want to use Research?</h1>
    <p class="lead mt-3">This sets the shape of your feed. It is a starting point, not a lock-in.</p>

    <div class="col gap-2 mt-6">
      ${INTENTS.map(i => `
        <button class="radio-card" data-act="onb:intent" data-id="${i.id}"
          data-selected="${draft.intent === i.id}">
          <span class="step-mark" style="margin-top:2px">${draft.intent === i.id ? icon('check', 10) : ''}</span>
          <span>
            <b>${esc(i.label)}</b>
            <span class="small muted" style="display:block">${esc(i.hint)}</span>
          </span>
        </button>`).join('')}
    </div>
  `, `
    <button class="btn btn-ghost" data-act="onb:finish">Skip</button>
    <button class="btn btn-primary btn-lg" data-act="onb:finish" ${draft.intent ? '' : 'disabled'}>
      Build my feed
    </button>
  `);
}

/* ---------------------------------------------------------------- Actions */
export function registerLandingActions(rerender) {
  on('nav:auth', () => go('/auth'));
  on('landing:how', () => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

  const signIn = (name, email) => {
    store.set({ account: { name, email } });
    draft = { interests: [], intent: null, query: '' };
    go('/onboarding/1');
  };

  on('auth:google', () => signIn('Sara', 'sara@example.com'));
  on('auth:submit', (_d, form) => {
    const email = form.querySelector('#email').value.trim();
    const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    signIn(name || 'Researcher', email);
  });

  /* Live filtering: repaint only the grid so the caret and focus survive. */
  const paintGrid = () => {
    const grid = document.getElementById('topicGrid');
    if (grid) grid.innerHTML = topicGrid();
    const count = document.querySelector('[data-topic-count]');
    if (count) count.textContent = `${draft.interests.length} selected`;
    const next = document.querySelector('[data-act="onb:next"][data-step="2"]');
    if (next) next.toggleAttribute('disabled', draft.interests.length < 1);
  };

  document.addEventListener('input', e => {
    if (e.target.id !== 'topicSearch') return;
    draft.query = e.target.value;
    paintGrid();
  });

  on('onb:toggle', ({ id }) => {
    draft.interests = draft.interests.includes(id)
      ? draft.interests.filter(x => x !== id)
      : [...draft.interests, id];
    paintGrid();
  });

  on('onb:create', () => {
    const input = document.getElementById('topicSearch');
    const value = (input?.value || '').trim();
    if (!value) return;
    if (!draft.interests.includes(value)) draft.interests.push(value);
    draft.query = '';
    if (input) input.value = '';
    paintGrid();
    toast(`Added "${value}" to your topics`);
  });

  on('onb:next', ({ step }) => {
    draft.query = document.getElementById('topicSearch')?.value ?? '';
    go(`/onboarding/${step}`);
  });

  on('onb:intent', ({ id }) => { draft.intent = id; rerender(); });

  on('onb:add', ({ kind }) => {
    store.set({ interests: draft.interests });
    window.dispatchEvent(new CustomEvent('add:open', { detail: { kind, from: 'onboarding' } }));
  });

  on('onb:finish', () => {
    store.set({
      interests: draft.interests.length ? draft.interests : ['AI', 'Technology'],
      intent: draft.intent,
      onboarded: true,
    });
    draft.interests.forEach(label => store.signal('followTopic', { label }));
    go('/home');
    toast('Your feed is ready');
  });
}

export const onboardingDraft = () => draft;
