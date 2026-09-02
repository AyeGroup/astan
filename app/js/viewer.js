/**
 * Visitor-facing orchestrator: QR landing -> question -> RAG -> speech -> avatar.
 *
 * Pipeline shape, and the reasoning behind it:
 *
 *   input  ->  RAG stream  ->  sentence queue  ->  speech queue  ->  mouth
 *
 * The two queues are what keep this usable on a phone in a hall. The RAG
 * answer is consumed as it streams, split into sentences, and each
 * sentence is spoken as soon as the previous one finishes, so the avatar
 * starts talking long before the model has finished generating.
 */

import { CONFIG, readObjectContext } from './config.js';
import { resolveAvatar, AVATARS } from './avatars.js';
import { AvatarRenderer } from './avatar.js';
import { Speaker, hasVoiceFor } from './tts.js';
import { Listener, sttSupport } from './stt.js';
import { RagClient } from './rag-client.js';
import { SentenceQueue } from './sentences.js';
import { t } from './i18n.js';

const el = (id) => document.getElementById(id);

class Viewer {
  constructor() {
    this.lang = CONFIG.ui.lang;
    this.tx = t(this.lang);
    this.object = readObjectContext();
    this.profile = resolveAvatar(CONFIG.avatar.id);
    this.profile = { ...this.profile, idleMotion: CONFIG.avatar.idleMotion };

    this.renderer = new AvatarRenderer(el('stage'), this.profile);
    this.speaker = new Speaker(CONFIG.tts, this.lang);
    this.listener = new Listener(CONFIG.stt, this.lang);
    this.rag = new RagClient(CONFIG.rag, { objectContext: this.object });

    this.speechQueue = [];
    this.speaking = false;
    this.busy = false;
    this.started = false;
  }

  async init() {
    document.documentElement.lang = this.lang;
    document.documentElement.dir = this.tx.dir;

    await this.renderer.load();
    this.renderer.start();
    this._pumpMouth();

    this._paintChrome();
    this._bind();
    window.addEventListener('resize', () => this.renderer.resize());
  }

  /** Drives the mouth from whatever speech driver is currently active. */
  _pumpMouth() {
    const loop = () => {
      const m = this.speaker.readMouth();
      this.renderer.setMouth(m.open, m.spread);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _paintChrome() {
    el('avatarName').textContent = this.profile.name || '';
    el('avatarRole').textContent = this.profile.role || '';
    el('input').placeholder = this.tx.ask;
    el('startLabel').textContent = this.tx.tapToStart;
    this._status(this.tx.idle);

    if (this.object) {
      el('objectChip').hidden = false;
      el('objectChip').textContent = `${this.tx.aboutObject} ${this.object.title}`;
    }

    const chips = el('suggestions');
    chips.innerHTML = '';
    for (const s of this.tx.suggestions) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = s;
      b.onclick = () => this.ask(s);
      chips.appendChild(b);
    }

    // Face switcher, so a museum can preview personas before committing
    const faces = el('faces');
    for (const a of AVATARS) {
      const b = document.createElement('button');
      b.className = 'face' + (a.id === this.profile.id ? ' on' : '');
      b.title = a.name;
      b.style.backgroundImage = `url(${a.image})`;
      b.onclick = () => { location.search = setParam('av', a.id); };
      faces.appendChild(b);
    }

    if (!sttSupport(CONFIG.stt).any) el('mic').hidden = true;
  }

  _bind() {
    el('gate').addEventListener('click', () => this.start());
    el('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = el('input').value.trim();
      if (!v) return;
      el('input').value = '';
      this.ask(v);
    });
    el('mic').addEventListener('click', () => this.toggleMic());
  }

  /** The gate exists because mobile browsers only unlock audio on a gesture. */
  async start() {
    if (this.started) return;
    this.started = true;
    el('gate').hidden = true;
    await this.speaker.unlock();

    // speechSynthesis populates voices asynchronously on most engines
    await new Promise(r => setTimeout(r, 120));
    if (this.speaker.mode === 'browser' && !hasVoiceFor(this.lang)) {
      this._warn(this.tx.noVoice);
    }
    if (CONFIG.ui.autoGreet) {
      const greeting = this.object
        ? `${this.tx.greeting}`
        : this.tx.greeting;
      this._bubble('bot', greeting);
      this._status(this.tx.speaking);
      await this.speaker.speak(greeting);
      this._status(this.tx.idle);
    }
  }

  async toggleMic() {
    if (this.listening) { this.listener.stop(); return; }
    if (!this.started) await this.start();

    // barge-in: a visitor interrupting the avatar is a feature, not an error
    this.speaker.stop();

    this.listening = true;
    el('mic').classList.add('on');
    this._status(this.tx.listening);

    this.listener.start({
      onPartial: (txt) => { el('input').value = txt; },
      onFinal: (txt) => { el('input').value = ''; if (txt) this.ask(txt); },
      onEnd: () => { this.listening = false; el('mic').classList.remove('on'); },
      onError: (err) => {
        this.listening = false;
        el('mic').classList.remove('on');
        this._status(this.tx.idle);
        console.warn('[stt]', err.message);
      }
    });
  }

  async ask(question) {
    if (this.busy) return;
    if (!this.started) await this.start();
    this.busy = true;
    this.speaker.stop();
    this.speechQueue.length = 0;

    this._bubble('user', question);
    this._status(this.tx.thinking);
    const bubble = this._bubble('bot', '');
    const t0 = performance.now();

    const queue = new SentenceQueue();
    let full = '';
    let firstSpeech = 0;

    try {
      for await (const chunk of this.rag.ask(question)) {
        full += chunk;
        bubble.textContent = full;
        this._scroll();
        for (const s of queue.feed(chunk)) {
          if (!firstSpeech) firstSpeech = performance.now() - t0;
          this._enqueue(s);
        }
      }
      for (const s of queue.flush()) this._enqueue(s);
    } catch (err) {
      bubble.textContent = 'خطا در دریافت پاسخ: ' + err.message;
    }

    this._badge(this.rag.lastTransport);
    this._log('question', { q: question, ms: Math.round(performance.now() - t0), firstSpeechMs: Math.round(firstSpeech) });
    this.busy = false;
  }

  _enqueue(sentence) {
    this.speechQueue.push(sentence);
    if (!this.speaking) this._drain();
  }

  async _drain() {
    this.speaking = true;
    this._status(this.tx.speaking);
    while (this.speechQueue.length) {
      const s = this.speechQueue.shift();
      await this.speaker.speak(s);
    }
    this.speaking = false;
    this._status(this.tx.idle);
  }

  _bubble(who, text) {
    const d = document.createElement('div');
    d.className = 'bubble ' + who;
    d.textContent = text;
    el('log').appendChild(d);
    this._scroll();
    return d;
  }

  _scroll() { const l = el('log'); l.scrollTop = l.scrollHeight; }
  _status(s) { el('status').textContent = s; }
  _warn(msg) { const w = el('warn'); w.textContent = msg; w.hidden = false; }

  _badge(transport) {
    const b = el('badge');
    if (transport === 'mock') { b.hidden = false; b.textContent = this.tx.demoMode; }
    else b.hidden = true;
  }

  /** Top questions per object is the report museums actually pay for. */
  _log(event, data) {
    if (!CONFIG.analytics.enabled) return;
    const payload = { event, ...data, object: this.object?.id || null, bot: CONFIG.rag.botUUID, lang: this.lang, at: Date.now() };
    if (CONFIG.analytics.endpoint) {
      const body = JSON.stringify(payload);
      // keepalive so the event survives the visitor closing the tab
      fetch(CONFIG.analytics.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } else {
      console.info('[analytics]', payload);
    }
  }
}

function setParam(k, v) {
  const p = new URLSearchParams(location.search);
  p.set(k, v);
  return '?' + p.toString();
}

new Viewer().init().catch(err => {
  console.error(err);
  document.getElementById('status').textContent = 'خطا: ' + err.message;
});
