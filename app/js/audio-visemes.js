/**
 * استخراج پارامترهای دهان از سیگنال صوتی، بدون هم‌ترازی واج (forced
 * alignment) و بدون مدل.
 *
 * منطق: به‌جای حدس‌زدن ویزم‌های گسسته — که بدون هم‌ترازی واج نتیجه‌اش
 * نویز است — دهان را در یک فضای پیوستهٔ دوبعدی توصیف می‌کنیم:
 *
 *   openness ← انرژی سیگنال (RMS) با نرمال‌سازی تطبیقی
 *   spread   ← مرکز طیفی (spectral centroid)
 *              بالا  → واکه‌های پیشین/کشیده مثل «ای» و «اِ»
 *              پایین → واکه‌های گرد مثل «او» و «اُ»
 *
 * این نگاشت مستقل از زبان است و برای فارسی بدون داده و آموزش کار می‌کند.
 * نرمال‌سازی تطبیقی باعث می‌شود بلندی خروجی TTS یا میکروفون مهم نباشد.
 */

const SILENCE = 0.006;

export class MouthAnalyzer {
  constructor(audioCtx, { fftSize = 1024 } = {}) {
    this.ctx = audioCtx;
    this.analyser = audioCtx.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = 0.35;

    this.time = new Float32Array(this.analyser.fftSize);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);

    this.peak = 0.05;      // سقف تطبیقی انرژی
    this.spread = 0.5;
  }

  /** گرهٔ صوتی را به تحلیلگر وصل می‌کند و همان گره را برمی‌گرداند. */
  connect(node) {
    node.connect(this.analyser);
    return node;
  }

  /** @returns {{open:number, spread:number, speaking:boolean}} */
  read() {
    this.analyser.getFloatTimeDomainData(this.time);

    let sum = 0;
    for (let i = 0; i < this.time.length; i++) sum += this.time[i] * this.time[i];
    const rms = Math.sqrt(sum / this.time.length);

    // سقف تطبیقی: سریع بالا می‌رود، آرام پایین می‌آید تا سکوت‌های کوتاه
    // باعث پرش ناگهانی حساسیت نشود.
    this.peak = rms > this.peak ? rms * 0.6 + this.peak * 0.4 : this.peak * 0.995;
    this.peak = Math.max(this.peak, 0.02);

    const speaking = rms > SILENCE;
    // ریشهٔ دوم: بلندی ادراکی، نه خطی. دهان روی صداهای آرام هم حرکت می‌کند.
    let open = speaking ? Math.sqrt(Math.min(rms / this.peak, 1)) : 0;
    open = Math.min(1, open * 1.08);

    if (speaking) {
      this.analyser.getByteFrequencyData(this.freq);
      let num = 0, den = 0;
      // فقط تا ~۴ کیلوهرتز: انرژی مفید گفتار همان‌جاست.
      const nyq = this.ctx.sampleRate / 2;
      const top = Math.min(this.freq.length, Math.round((4000 / nyq) * this.freq.length));
      for (let i = 1; i < top; i++) { num += i * this.freq[i]; den += this.freq[i]; }
      if (den > 0) {
        const centroid = num / den / top;                 // ۰..۱
        const target = clamp((centroid - 0.12) / 0.28, 0, 1);
        this.spread += (target - this.spread) * 0.25;     // هموارسازی
      }
    } else {
      this.spread += (0.5 - this.spread) * 0.1;
    }

    return { open, spread: this.spread, speaking };
  }
}

/**
 * پیشرانِ جایگزین برای وقتی که به سیگنال صوتی دسترسی نداریم.
 *
 * نکتهٔ مهم: خروجی SpeechSynthesis مرورگر قابل اتصال به WebAudio نیست،
 * پس در حالت TTS مرورگری هیچ سیگنالی برای تحلیل وجود ندارد. در این حالت
 * از یک پوش هجایی مصنوعی استفاده می‌کنیم که با رویدادهای boundary (در
 * موتورهایی که پشتیبانی می‌کنند) با متن هم‌گام می‌شود.
 */
export class SyntheticMouth {
  constructor() { this.t0 = 0; this.active = false; this.wordSeed = 0; }

  start() { this.t0 = performance.now(); this.active = true; }
  stop() { this.active = false; }
  /** با هر رویداد boundary صدا زده می‌شود تا الگو با کلمهٔ جدید عوض شود. */
  onWord(charIndex = 0) { this.wordSeed = charIndex; }

  read() {
    if (!this.active) return { open: 0, spread: 0.5, speaking: false };
    const t = (performance.now() - this.t0) / 1000;
    // ~۴.۵ هجا بر ثانیه = آهنگ طبیعی گفتار فارسی
    const syl = Math.sin(t * Math.PI * 4.5 + this.wordSeed * 0.7);
    const micro = Math.sin(t * Math.PI * 13.0) * 0.15;
    const open = clamp(0.45 + syl * 0.35 + micro, 0.05, 1);
    const spread = clamp(0.5 + Math.sin(t * 1.7 + this.wordSeed) * 0.3, 0, 1);
    return { open, spread, speaking: true };
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
