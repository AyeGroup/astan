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
    if (this.driver === 'audio' && this.analyzer) return this.analyzer.read();
    if (this.driver === 'synthetic') return this.synthetic.read();
    return { open: 0, spread: 0.5, speaking: false };
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
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this.synthetic.stop();
    this.driver = null;
  }

  async _speakServer(text) {
    await this.unlock();
    if (!this.audioCtx) throw new Error('no AudioContext');

    const voice = this.cfg.voice || LANG_TAG[this.lang] || 'fa-IR';
    const key = await hashKey('tts', voice, String(this.cfg.rate), text);

    let blob = this.cfg.cache ? await getAudio(key) : null;
    if (!blob) {
      const res = await fetch(this.cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, lang: LANG_TAG[this.lang], rate: this.cfg.rate })
      });
      if (!res.ok) throw new Error('TTS HTTP ' + res.status);
      blob = await res.blob();
      if (this.cfg.cache) putAudio(key, blob);
    }

    const buf = await this.audioCtx.decodeAudioData(await blob.arrayBuffer());
    return new Promise((resolve) => {
      const src = this.audioCtx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = this.cfg.rate || 1;
      this.analyzer.connect(src);          // src -> analyser -> destination
      src.onended = () => { this.driver = null; this.source = null; resolve(); };
      this.source = src;
      this.driver = 'audio';
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
