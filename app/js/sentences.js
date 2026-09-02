/**
 * Incremental sentence splitter for the streaming answer.
 *
 * Why this exists: waiting for the full answer before synthesising speech
 * adds one to three seconds of dead air. Feeding the speech engine the
 * first complete sentence the moment it lands cuts perceived latency to
 * roughly the time-to-first-sentence of the model, and everything after
 * that is masked by the avatar already talking.
 *
 * Persian punctuation is handled explicitly, and an over-long clause is
 * broken at a comma so the first utterance is never a paragraph.
 */

const TERMINATORS = /[.!?\u061F\u061B:\n]/;   // . ! ? ؟ ؛ :
const SOFT_BREAK = /[\u060C,]/;               // ، ,
const SOFT_LIMIT = 90;

export class SentenceQueue {
  constructor() { this.buf = ''; }

  /** @returns {string[]} sentences that are complete as of this chunk */
  feed(chunk) {
    this.buf += chunk;
    const out = [];
    let guard = 0;
    while (guard++ < 100) {
      const cut = this._findCut(this.buf);
      if (cut < 0) break;
      const s = this.buf.slice(0, cut + 1).trim();
      this.buf = this.buf.slice(cut + 1);
      if (s) out.push(s);
    }
    return out;
  }

  /** Whatever is left when the stream ends. */
  flush() {
    const s = this.buf.trim();
    this.buf = '';
    return s ? [s] : [];
  }

  _findCut(s) {
    const hard = s.search(TERMINATORS);
    if (hard >= 0) return hard;
    if (s.length >= SOFT_LIMIT) {
      // break at the last comma inside the window, not the first one after,
      // so the fragment stays a natural breath group
      for (let i = Math.min(s.length, SOFT_LIMIT * 1.4) - 1; i > SOFT_LIMIT * 0.4; i--) {
        if (SOFT_BREAK.test(s[i])) return i;
      }
    }
    return -1;
  }
}
