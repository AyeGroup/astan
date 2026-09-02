/**
 * Adapter over the existing ragbuilder backend.
 *
 * Two things this layer buys us:
 *
 * 1. Transport independence. It tries a streaming (SSE) read first and
 *    silently degrades to a single JSON response, so the avatar can start
 *    speaking the first sentence while the rest of the answer is still
 *    being generated. That is the single biggest lever on perceived
 *    latency, worth more than any model or infrastructure change.
 *
 * 2. A mock transport, so the whole product runs and demos with no
 *    backend at all, and so the exact API contract can be pinned down
 *    later without blocking any other work.
 */

export class RagClient {
  constructor(cfg, { objectContext = null } = {}) {
    this.cfg = cfg;
    this.objectContext = objectContext;
    this.sessionId = sessionId();
    this.lastTransport = null;
  }

  get url() {
    return this.cfg.baseUrl.replace(/\/$/, '') + this.cfg.chatPath;
  }

  _payload(question) {
    const f = this.cfg.fields;
    const body = {
      [f.message]: question,
      [f.bot]: this.cfg.botUUID,
      [f.session]: this.sessionId
    };
    // The scanned object is injected as retrieval context, so "این اثر
    // مال چه دوره‌ای است؟" resolves without the visitor naming anything.
    if (this.objectContext) {
      body[f.context] = { object_id: this.objectContext.id, object_title: this.objectContext.title };
    }
    return body;
  }

  /**
   * Async generator yielding answer fragments as they arrive.
   * @param {string} question
   */
  async *ask(question) {
    const transport = this.cfg.transport;
    if (transport === 'mock') { this.lastTransport = 'mock'; yield* mockAnswer(question, this.objectContext); return; }

    try {
      yield* this._askHttp(question);
    } catch (err) {
      if (transport === 'auto') {
        console.warn('[rag] backend unreachable, using mock transport:', err.message);
        this.lastTransport = 'mock';
        yield* mockAnswer(question, this.objectContext);
        return;
      }
      throw err;
    }
  }

  async *_askHttp(question) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs || 20000);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream, application/json' },
        body: JSON.stringify(this._payload(question)),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error('RAG HTTP ' + res.status);

      const ctype = res.headers.get('content-type') || '';
      if (ctype.includes('event-stream') && res.body) {
        this.lastTransport = 'sse';
        yield* readSse(res.body);
      } else {
        this.lastTransport = 'json';
        const data = await res.json();
        yield pick(data, this.cfg.fields.answer) || '';
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Reads an SSE body and yields the text delta of each event. */
async function* readSse(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split(/\n\n/);
    buf = parts.pop();
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        let piece = raw;
        try {
          const obj = JSON.parse(raw);
          piece = obj.delta || obj.text || obj.content || obj.answer || '';
        } catch { /* plain text payload */ }
        if (piece) yield piece;
      }
    }
  }
}

function pick(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function sessionId() {
  const k = 'museum-avatar-session';
  let v = sessionStorage.getItem(k);
  if (!v) { v = 'S' + Math.random().toString(36).slice(2, 12); sessionStorage.setItem(k, v); }
  return v;
}

/** Offline demo answers, streamed word by word so timing feels real. */
async function* mockAnswer(question, objectContext) {
  const q = question.toLowerCase();
  const subject = objectContext ? objectContext.title : 'این بخش';
  let text;
  if (/ساعت|باز|تعطیل/.test(q)) {
    text = 'موزه هر روز از ساعت ۹ صبح تا ۱۷ باز است، به‌جز روزهای تعطیل رسمی. آخرین ورود ساعت ۱۶:۳۰ است.';
  } else if (/کجا|مسیر|سرویس|بهداشت/.test(q)) {
    text = 'سرویس بهداشتی در ضلع شمالی حیاط، کنار خروجی گالری دوم قرار دارد. اگر بخواهید مسیر را قدم‌به‌قدم برایتان می‌گویم.';
  } else if (/قدمت|تاریخ|دوره|چند سال/.test(q)) {
    text = `${subject} به دورهٔ صفوی بازمی‌گردد و بر اساس کتیبهٔ حاشیهٔ آن، حدود چهارصد سال قدمت دارد. جنس بدنه سفال لعاب‌دار است.`;
  } else if (/سلام|درود|خوش/.test(q)) {
    text = 'سلام! خوش آمدید. من راهنمای هوشمند این موزه هستم؛ دربارهٔ هر اثری که می‌بینید می‌توانید از من بپرسید.';
  } else {
    text = `دربارهٔ ${subject} پرسیدید. در حالت نمایشی هستم و به پایگاه دانش موزه وصل نیستم، اما وقتی سرویس RAG متصل شود پاسخ دقیق از روی محتوای خود موزه ساخته می‌شود.`;
  }
  for (const w of text.split(' ')) {
    await new Promise(r => setTimeout(r, 45));
    yield w + ' ';
  }
}
