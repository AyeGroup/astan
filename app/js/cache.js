/**
 * Client-side cache on IndexedDB.
 *
 * چرا مهم است: در یک موزه، اکثریت قاطع پرسش‌ها تکراری‌اند (ساعت کار،
 * سرویس بهداشتی، قدمت این اثر). کش‌کردن صوتِ سنتزشده یعنی پاسخ‌های
 * پرتکرار به‌صورت آنی پخش می‌شوند و بار TTS و تأخیر ادراکی حذف می‌شود.
 */

const DB_NAME = 'museum-avatar';
const DB_VERSION = 1;
const STORE_AUDIO = 'tts';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

export async function hashKey(...parts) {
  const data = new TextEncoder().encode(parts.join(' '));
  if (!crypto.subtle) return parts.join('|').slice(0, 200);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getAudio(key) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, 'readonly');
      const req = tx.objectStore(STORE_AUDIO).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

export async function putAudio(key, blob) {
  try {
    const db = await open();
    const tx = db.transaction(STORE_AUDIO, 'readwrite');
    tx.objectStore(STORE_AUDIO).put({ key, blob, at: Date.now() });
  } catch { /* cache must never break the main path */ }
}
