/* ==========================================================================
   State: persisted to localStorage. Every interaction is a personalization
   signal, weighted per §57 of the spec (strong / medium / negative).
   ========================================================================== */

import { ARTICLES, TOPICS, SOURCES, NOTIFICATIONS } from './data.js';

const KEY = 'pri.state.v1';

const SIGNAL_WEIGHT = {
  save: 6, complete: 5, followTopic: 8, followSource: 6, search: 4, ask: 5,
  open: 2, readingTime: 2, translate: 3,
  notInterested: -8, hideSource: -10, skip: -3,
};

const defaults = () => ({
  account: null,                 // { name, email }
  onboarded: false,
  interests: [],                 // free-text interest labels chosen in onboarding
  intent: null,                  // §11 — how they want to use Research
  topicWeights: Object.fromEntries(TOPICS.map(t => [t.id, t.weight])),
  saved: [],
  read: [],
  dismissed: [],                 // "not interested"
  hiddenSources: [],
  followedTopics: ['ai-agents', 'ai-reg'],
  sourceState: Object.fromEntries(SOURCES.map(s => [s.id, {
    status: s.status, frequency: s.frequency,
    tracked: s.categories.filter(c => c.tracked).map(c => c.name),
  }])),
  extraArticles: [],             // articles added by the user this session
  extraSources: [],
  readNotifications: [],
  signals: [],                   // audit trail, surfaced in Settings
  theme: null,          // null = follow the viewer's system preference
  lastVisit: null,
  research: [],                  // saved research answers
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

const listeners = new Set();
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  listeners.forEach(fn => fn(state));
}

export const get = () => state;

export function set(patch) {
  state = { ...state, ...patch };
  save();
}

export function reset() {
  state = defaults();
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  save();
}

/* --- Signals ------------------------------------------------------------- */
export function signal(kind, { topicId, sourceId, label } = {}) {
  const weight = SIGNAL_WEIGHT[kind] ?? 0;
  if (topicId && weight) {
    const w = { ...state.topicWeights };
    w[topicId] = Math.max(0, Math.min(100, (w[topicId] ?? 40) + weight));
    state.topicWeights = w;
  }
  state.signals = [
    { kind, topicId, sourceId, label, weight, at: Date.now() },
    ...state.signals,
  ].slice(0, 60);
  save();
}

/* --- Article helpers ----------------------------------------------------- */
export const allArticles = () => [...state.extraArticles, ...ARTICLES];
export const allSources = () => [...state.extraSources, ...SOURCES];

export const findArticle = id => allArticles().find(a => a.id === id);
export const findSource = id => allSources().find(s => s.id === id);

export const isSaved = id => state.saved.includes(id);
export const isRead = id => state.read.includes(id);
export const isDismissed = id => state.dismissed.includes(id);

export function toggleSave(id) {
  const a = findArticle(id);
  if (isSaved(id)) {
    state.saved = state.saved.filter(x => x !== id);
    save();
    return false;
  }
  state.saved = [id, ...state.saved];
  signal('save', { topicId: a?.topic, sourceId: a?.source, label: a?.title });
  return true;
}

export function markRead(id) {
  if (isRead(id)) return;
  const a = findArticle(id);
  state.read = [id, ...state.read];
  signal('complete', { topicId: a?.topic, sourceId: a?.source, label: a?.title });
}

export function dismiss(id) {
  const a = findArticle(id);
  state.dismissed = [id, ...state.dismissed];
  signal('notInterested', { topicId: a?.topic, sourceId: a?.source, label: a?.title });
}

export function toggleFollowTopic(id) {
  if (state.followedTopics.includes(id)) {
    state.followedTopics = state.followedTopics.filter(x => x !== id);
    save();
    return false;
  }
  state.followedTopics = [id, ...state.followedTopics];
  signal('followTopic', { topicId: id, label: id });
  return true;
}

export function hideSource(id) {
  if (!state.hiddenSources.includes(id)) state.hiddenSources = [id, ...state.hiddenSources];
  signal('hideSource', { sourceId: id, label: id });
}

export function setSourceState(id, patch) {
  state.sourceState = { ...state.sourceState, [id]: { ...(state.sourceState[id] || {}), ...patch } };
  save();
}

export function addArticle(a) {
  state.extraArticles = [a, ...state.extraArticles];
  signal('open', { topicId: a.topic, label: a.title });
}

export function addSource(s) {
  state.extraSources = [s, ...state.extraSources];
  state.sourceState = {
    ...state.sourceState,
    [s.id]: { status: 'monitoring', frequency: s.frequency, tracked: s.categories.filter(c => c.tracked).map(c => c.name) },
  };
  signal('followSource', { sourceId: s.id, label: s.name });
}

export function addResearch(entry) {
  state.research = [entry, ...state.research].slice(0, 20);
  signal('ask', { label: entry.question });
}

/* --- Personalized relevance --------------------------------------------- */
/* Base editorial relevance, nudged by how strongly the user engages with the
   topic. Kept transparent: the reasons shown in the UI come from the article,
   never from the score itself. */
export function personalRelevance(a) {
  const base = a.relevance ?? 60;
  const w = state.topicWeights[a.topic] ?? 45;
  /* Engagement adjusts the editorial score; it never dominates it, so a
     low-quality match cannot be pushed to the top by enthusiasm alone. */
  const nudge = Math.max(-9, Math.min(4, Math.round((w - 60) / 9)));
  return Math.max(35, Math.min(97, base + nudge));
}

export function feed({ excludeDismissed = true, excludeRead = false } = {}) {
  return allArticles()
    .filter(a => !state.hiddenSources.includes(a.source))
    .filter(a => (excludeDismissed ? !isDismissed(a.id) : true))
    .filter(a => (excludeRead ? !isRead(a.id) : true))
    .map(a => ({ ...a, score: personalRelevance(a) }))
    .sort((x, y) => y.score - x.score);
}

export function rankedTopics() {
  return TOPICS
    .map(t => ({ ...t, weight: state.topicWeights[t.id] ?? t.weight }))
    .sort((a, b) => b.weight - a.weight);
}

export function notifications() {
  return NOTIFICATIONS.map(n => ({ ...n, unread: n.unread && !state.readNotifications.includes(n.id) }));
}

export function readNotification(id) {
  if (!state.readNotifications.includes(id)) {
    state.readNotifications = [id, ...state.readNotifications];
    save();
  }
}

export function readAllNotifications() {
  state.readNotifications = NOTIFICATIONS.map(n => n.id);
  save();
}

/* --- Theme --------------------------------------------------------------- */
const systemTheme = () =>
  (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/* Until the reader picks a side, follow their system preference. */
export const resolvedTheme = () => state.theme || systemTheme();

export function applyTheme(theme) {
  if (theme !== undefined) state.theme = theme;
  document.documentElement.setAttribute('data-theme', resolvedTheme());
  save();
}

export function toggleTheme() {
  applyTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
}

/* --- Visit tracking ------------------------------------------------------ */
export function touchVisit() {
  const prev = state.lastVisit;
  state.lastVisit = Date.now();
  save();
  return prev;
}
