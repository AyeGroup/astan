/**
 * Text-to-speech layer with two paths.
 *
 * server  - a configurable endpoint (recommended: Piper with an fa_IR voice
 *   on plain CPU) that returns audio. This is the only path that yields
 *   genuinely synchronised lip-sync, because the audio signal is available
 *   for analysis.
 *
 * browser - SpeechSynthesis. Free and serverless, but has two hard limits:
 *   its output cannot be routed into WebAudio, so the mouth must be driven
 *   by a synthetic envelope; and Persian voice coverage is absent on iOS
 *   and not guaranteed on Android.
 *
 * In 'auto' mode a configured server endpoint wins, otherwise we fall back
 * to the browser and surface a warning when no voice exists for the language.
 */

import { MouthAnalyzer, SyntheticMouth } from './audio-visemes.js';
import { hashKey, getAudio, putAudio } from './cache.js';

const LANG_TAG = { fa: 'fa-IR', en: 'en-US', ar: 'ar-SA' };

export class Speaker {
  constructor(cfg, lang = 'fa') {
    this.cfg = cfg;
    this.lang = lang;
    this.audioCtx = null;
    this.analyzer = null;
    this.synthetic = new SyntheticMouth();
    this.source = null;
    this.driver = null;          // 'audio' | 'synthetic'
  }

  get mode() {
    if (this.cfg.mode !== 'auto') return this.cfg.mode;
    return this.cfg.endpoint ? 'server' : 'browser';
  }

  /** Call only after a user gesture, because of mobile autoplay policy. */
  async unlock() {
    if (this.audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.audioCtx = new AC();
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
    this.analyzer = new MouthAnalyzer(this.audioCtx);
    this.analyzer.analyser.connect(this.audioCtx.destination);
  }

  /** Instantaneous mouth parameters for the avatar renderer. */
  readMouth() {
    if (this.driver === 'timeline') return this._readTimeline();
    if (this.driver === 'audio' && this.analyzer) return this.analyzer.read();
    if (this.driver === 'synthetic') return this.synthetic.read();
    return { open: 0, spread: 0.5, speaking: false };
  }

  /**
   * Phoneme-aligned mouth targets, the preferred driver.
   *
   * Audio energy cannot tell the mouth to close: energy stays high through
   * م، ب، پ, so an amplitude-driven mouth hangs open on exactly the sounds
   * a viewer can see. The timeline closes it because it knows the phoneme.
   *
   * Targets are returned as steps; the renderer already smooths between
   * them with a fast attack and slower release, which is how a jaw moves.
   */
  _readTimeline() {
    const tl = this.timeline;
    if (!tl || !tl.length) return { open: 0, spread: 0.5, speaking: false };

    const t = this.audioCtx.currentTime - this.timelineStart;
    // a forward cursor rather than a search: playback only moves forwards
    while (this.timelineIndex < tl.length - 1 && tl[this.timelineIndex + 1].t <= t) {
      this.timelineIndex++;
    }
    while (this.timelineIndex > 0 && tl[this.timelineIndex].t > t) {
      this.timelineIndex--;
    }
    const seg = tl[this.timelineIndex];
    return { open: seg.o, spread: seg.s, speaking: seg.o > 0.02 };
  }

  /** Speaks one sentence; resolves when playback finishes. */
  async speak(text) {
    const clean = (text || '').trim();
    if (!clean || this.mode === 'off') return;
    if (this.mode === 'server' && this.cfg.endpoint) {
      try { return await this._speakServer(clean); }
      catch (e) { console.warn('[tts] server failed, falling back to browser:', e.message); }
    }
    return this._speakBrowser(clean);
  }

  stop() {
    try { this.source && this.source.stop(); } catch { /* already stopped */ }
    this.source = null;
    this.timeline = null;
    this.timelineIndex = 0;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this.synthetic.stop();
    this.driver = null;
  }

  async _speakServer(text) {
    await this.unlock();
    if (!this.audioCtx) throw new Error('no AudioContext');

    const voice = this.cfg.voice || LANG_TAG[this.lang] || 'fa-IR';
    const key = await hashKey('tts', voice, String(this.cfg.rate), text);

    const cached = this.cfg.cache ? await getAudio(key) : null;
    let blob = cached && cached.blob;
    let meta = cached && cached.meta;

    if (!blob) {
      // ask for JSON so the viseme timeline comes back with the audio; a
      // server that only knows how to return WAV still works, we just fall
      // back to driving the mouth from the audio signal
      const res = await fetch(this.cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text, voice, lang: LANG_TAG[this.lang], rate: this.cfg.rate, format: 'json'
        })
      });
      if (!res.ok) throw new Error('TTS HTTP ' + res.status);

      const ctype = res.headers.get('content-type') || '';
      if (ctype.includes('application/json')) {
        const data = await res.json();
        blob = new Blob([base64ToBytes(data.audio)], { type: data.mime || 'audio/wav' });
        meta = { timeline: data.timeline || null, duration: data.duration };
      } else {
        blob = await res.blob();
        meta = null;
      }
      if (this.cfg.cache) putAudio(key, blob, meta);
    }

    const buf = await this.audioCtx.decodeAudioData(await blob.arrayBuffer());
    return new Promise((resolve) => {
      const src = this.audioCtx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = this.cfg.rate || 1;
      this.analyzer.connect(src);          // src -> analyser -> destination

      const timeline = meta && meta.timeline;
      if (timeline && timeline.length) {
        this.timeline = timeline;
        this.timelineIndex = 0;
        this.timelineStart = this.audioCtx.currentTime;
        this.driver = 'timeline';
      } else {
        this.driver = 'audio';
      }

      src.onended = () => {
        this.driver = null;
        this.timeline = null;
        this.source = null;
        resolve();
      };
      this.source = src;
      src.start();
    });
  }

  _speakBrowser(text) {
    const synth = window.speechSynthesis;
    if (!synth) return Promise.resolve();

    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const tag = LANG_TAG[this.lang] || 'fa-IR';
      u.lang = tag;
      u.rate = this.cfg.rate || 1;
      u.pitch = this.cfg.pitch || 1;

      const voice = pickVoice(tag, this.cfg.voice);
      if (voice) u.voice = voice;

      // boundary events let the synthetic envelope re-sync with the text
      u.onboundary = (e) => this.synthetic.onWord(e.charIndex || 0);
      const done = () => { this.synthetic.stop(); this.driver = null; resolve(); };
      u.onend = done;
      u.onerror = done;

      this.synthetic.start();
      this.driver = 'synthetic';
      synth.speak(u);
    });
  }
}

/** Is there any voice for this language on this device? Used for UI warnings. */
export function hasVoiceFor(lang) {
  const tag = LANG_TAG[lang] || lang;
  if (!window.speechSynthesis) return false;
  return !!pickVoice(tag);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pickVoice(tag, preferredName) {
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  if (!voices.length) return null;
  if (preferredName) {
    const byName = voices.find(v => v.name === preferredName);
    if (byName) return byName;
  }
  const base = tag.split('-')[0];
  return voices.find(v => v.lang === tag)
      || voices.find(v => v.lang && v.lang.replace('_', '-').startsWith(base))
      || null;
}
