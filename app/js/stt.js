/**
 * Speech input with graceful degradation.
 *
 * browser - webkitSpeechRecognition. Available on Android Chrome with
 *   fa-IR; on iOS Safari coverage for Persian is unreliable, so we never
 *   assume it and always keep the keyboard path visible.
 *
 * server  - MediaRecorder captures the utterance and POSTs it to a
 *   configurable endpoint (recommended: faster-whisper large-v3, which is
 *   solid on Persian). Costs a couple of seconds of CPU per utterance and
 *   works identically on every platform.
 */

const LANG_TAG = { fa: 'fa-IR', en: 'en-US', ar: 'ar-SA' };

export function sttSupport(cfg) {
  const browser = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const server = !!cfg.endpoint && !!navigator.mediaDevices;
  return { browser, server, any: (cfg.mode !== 'off') && (browser || server) };
}

export class Listener {
  constructor(cfg, lang = 'fa') {
    this.cfg = cfg;
    this.lang = lang;
    this.recognition = null;
    this.recorder = null;
    this.chunks = [];
    this.stream = null;
  }

  get mode() {
    const sup = sttSupport(this.cfg);
    if (this.cfg.mode === 'browser') return sup.browser ? 'browser' : 'off';
    if (this.cfg.mode === 'server') return sup.server ? 'server' : 'off';
    if (this.cfg.mode === 'off') return 'off';
    if (sup.browser) return 'browser';
    return sup.server ? 'server' : 'off';
  }

  /**
   * Starts listening.
   * @param {{onPartial?:function(string), onFinal:function(string), onError?:function(Error)}} handlers
   */
  async start(handlers) {
    this.handlers = handlers;
    if (this.mode === 'browser') return this._startBrowser();
    if (this.mode === 'server') return this._startServer();
    handlers.onError && handlers.onError(new Error('no speech input available'));
  }

  stop() {
    if (this.recognition) { try { this.recognition.stop(); } catch { /* noop */ } }
    if (this.recorder && this.recorder.state === 'recording') this.recorder.stop();
  }

  _startBrowser() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = LANG_TAG[this.lang] || 'fa-IR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
      }
      if (interim && this.handlers.onPartial) this.handlers.onPartial(interim);
      if (final) this.handlers.onFinal(final.trim());
    };
    rec.onerror = (e) => this.handlers.onError && this.handlers.onError(new Error(e.error));
    rec.onend = () => { this.recognition = null; this.handlers.onEnd && this.handlers.onEnd(); };

    this.recognition = rec;
    rec.start();
  }

  async _startServer() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(this.stream);
    this.chunks = [];

    rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    rec.onstop = async () => {
      this.stream.getTracks().forEach(t => t.stop());
      this.handlers.onEnd && this.handlers.onEnd();
      try {
        const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' });
        const fd = new FormData();
        fd.append('audio', blob, 'utterance.webm');
        fd.append('lang', LANG_TAG[this.lang] || 'fa-IR');
        const res = await fetch(this.cfg.endpoint, { method: 'POST', body: fd });
        if (!res.ok) throw new Error('STT HTTP ' + res.status);
        const data = await res.json();
        this.handlers.onFinal((data.text || '').trim());
      } catch (err) {
        this.handlers.onError && this.handlers.onError(err);
      }
    };

    this.recorder = rec;
    rec.start();
    // hard stop so a forgotten open mic in a noisy hall cannot run forever
    setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, (this.cfg.maxSeconds || 15) * 1000);
  }
}
