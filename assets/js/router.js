/* Minimal hash router: #/segment/segment */
const routes = new Map();
let notFound = null;
let current = { path: '/', segments: [] };

export const route = (name, handler) => routes.set(name, handler);
export const setNotFound = fn => { notFound = fn; };
export const currentRoute = () => current;

export function go(path, { replace = false } = {}) {
  const hash = '#' + (path.startsWith('/') ? path : '/' + path);
  if (location.hash === hash) return resolve();
  if (replace) {
    /* Sandboxed frames can refuse history writes; falling back to a plain
       hash change keeps navigation working, it just keeps the entry. */
    try { history.replaceState(null, '', hash); resolve(); return; }
    catch { location.hash = hash; return; }
  }
  location.hash = hash;
}

export function resolve() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const segments = raw.split('/').filter(Boolean);
  current = { path: raw, segments };
  const handler = routes.get(segments[0] || '') || notFound;
  if (handler) handler(segments.slice(1), current);
}

export function start() {
  window.addEventListener('hashchange', () => { resolve(); window.scrollTo(0, 0); });
  resolve();
}
