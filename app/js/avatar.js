/**
 * موتور رندر آواتار دوبعدی — کاملاً سمت کلاینت، بدون GPU سرور.
 *
 * روش «warp»: ناحیهٔ دهانِ یک پرترهٔ ثابت به‌صورت نواری (slice) بازترسیم
 * می‌شود؛ هر نوار به نسبت فاصله‌اش از خط لب به پایین جابه‌جا و در راستای
 * افقی کشیده می‌شود. نتیجه، افتادن نرم فک و باز/بسته شدن دهان است بدون
 * درز دیداری، چون بالای ناحیه دقیقاً روی پیکسل‌های اصلی خودش می‌نشیند و
 * جابه‌جایی با یک تابع میرایی به صفر می‌رسد.
 *
 * مزیت محصولی: هر موزه فقط یک «عکس» می‌دهد؛ نیازی به طراح، اسپرایت
 * ویزم یا مدل سه‌بعدی نیست. کالیبراسیون در app/studio.html انجام می‌شود.
 */

const SLICES = 26;          // تعداد نوارهای افقی ناحیهٔ فک
const LERP_UP = 0.45;       // سرعت باز شدن دهان (attack)
const LERP_DOWN = 0.22;     // سرعت بسته شدن (release) — کندتر، طبیعی‌تر

export class AvatarRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} profile پروفایل کالیبراسیون آواتار (نسبت‌های ۰..۱ از تصویر)
   */
  constructor(canvas, profile) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.profile = profile;
    this.img = null;

    // بوم پایه (بدون حرکت سر). نوارهای دهان از این بوم خوانده می‌شوند تا
    // تبدیلِ حرکت سر فقط یک‌بار — هنگام ترسیم روی بوم اصلی — اعمال شود.
    this.base = document.createElement('canvas');
    this.baseCtx = this.base.getContext('2d');
    this.geom = null;

    this.targetOpen = 0;
    this.targetSpread = 0.5;
    this.open = 0;
    this.spread = 0.5;

    this.running = false;
    this.t0 = performance.now();
    this._raf = null;
  }

  async load() {
    this.img = await loadImage(this.profile.image);
    this.resize();   // resize خودش بوم پایه را می‌سازد
    this.draw(0);
    return this;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);   // سقف ۲ برای موبایل‌های ضعیف
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this._renderBase();
  }

  /** تصویر پرتره را یک‌بار روی بوم پایه می‌نشاند و هندسهٔ آن را نگه می‌دارد. */
  _renderBase() {
    if (!this.img) return;
    const W = this.canvas.width, H = this.canvas.height;
    this.base.width = W;
    this.base.height = H;
    const s = Math.max(W / this.img.width, H / this.img.height);   // cover
    const dw = this.img.width * s, dh = this.img.height * s;
    const dx = (W - dw) / 2, dy = (H - dh) / 2;
    this.baseCtx.clearRect(0, 0, W, H);
    this.baseCtx.drawImage(this.img, dx, dy, dw, dh);
    this.geom = { dx, dy, dw, dh };
  }

  /** ورودی موتور: میزان بازشدگی و کشیدگی افقی دهان، هر دو در بازهٔ ۰..۱ */
  setMouth(openness, spread) {
    this.targetOpen = clamp(openness, 0, 1);
    if (typeof spread === 'number') this.targetSpread = clamp(spread, 0, 1);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = (t) => {
      if (!this.running) return;
      this.step();
      this.draw(t - this.t0);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  /** میان‌یابی نامتقارن: باز شدن سریع، بسته شدن کند — شبیه فک واقعی */
  step() {
    const k = this.targetOpen > this.open ? LERP_UP : LERP_DOWN;
    this.open += (this.targetOpen - this.open) * k;
    this.spread += (this.targetSpread - this.spread) * 0.18;
  }

  draw(elapsed = 0) {
    const { ctx, canvas } = this;
    if (!this.geom) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.save();

    // حرکت خفیف سر: نبودِ آن باعث می‌شود آواتار «مرده» به نظر برسد.
    if (this.profile.idleMotion !== false) {
      const tt = elapsed / 1000;
      const bob = Math.sin(tt * 1.1) * H * 0.004 + this.open * H * 0.004;
      const sway = Math.sin(tt * 0.7) * W * 0.003;
      const tilt = Math.sin(tt * 0.53) * 0.006;
      ctx.translate(W / 2 + sway, H / 2 + bob);
      ctx.rotate(tilt);
      ctx.translate(-W / 2, -H / 2);
    }

    ctx.drawImage(this.base, 0, 0);
    this._drawMouth();

    ctx.restore();
  }

  /** ناحیهٔ دهان/فک را روی تصویر پایه بازترسیم می‌کند. */
  _drawMouth() {
    const ctx = this.ctx;
    const { dx, dy, dw, dh } = this.geom;
    const m = this.profile.mouth;
    if (!m) return;

    const open = this.open;
    if (open < 0.005) return;                       // دهان بسته: نیازی به بازترسیم نیست

    // مختصات ناحیهٔ دهان در فضای بوم
    const cx = dx + m.x * dw;
    const cy = dy + m.y * dh;
    const mw = m.w * dw;
    const jaw = (m.jaw ?? 0.10) * dh;               // ارتفاع ناحیهٔ فک تا چانه
    const maxDrop = (m.drop ?? 0.045) * dh;         // بیشینهٔ افتادن فک
    const drop = open * maxDrop;

    // ۱) داخل دهان (تیره) — قبل از نوارها تا زیر لب بالا دیده شود
    const innerW = mw * (0.42 + 0.30 * this.spread);
    const innerH = drop * 1.15;
    if (innerH > 0.5) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy + innerH * 0.42, innerW / 2, innerH / 2, 0, 0, Math.PI * 2);
      const g = ctx.createLinearGradient(0, cy, 0, cy + innerH);
      g.addColorStop(0, 'rgba(52,18,22,0.95)');
      g.addColorStop(1, 'rgba(96,38,44,0.9)');
      ctx.fillStyle = g;
      ctx.fill();

      // دندان‌های بالا — فقط وقتی دهان واقعاً باز است
      const teeth = clamp((open - 0.25) * 2.0, 0, 1);
      if (teeth > 0) {
        ctx.globalAlpha = teeth * 0.85;
        ctx.beginPath();
        ctx.ellipse(cx, cy + innerH * 0.10, innerW * 0.42, innerH * 0.18, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#f2ece4';
        ctx.fill();
      }
      ctx.restore();
    }

    // ۲) نوارهای فک: از خط لب تا چانه، با میرایی جابه‌جایی
    const sx0 = cx - mw / 2;
    const stripW = mw;
    const sliceH = jaw / SLICES;
    // کشیدگی افقی: /i/ پهن، /u/ گرد. spread=0.5 خنثی است.
    const stretch = 1 + (this.spread - 0.5) * 0.18 * open;

    for (let i = 0; i < SLICES; i++) {
      const y = cy + i * sliceH;
      const f = 1 - i / SLICES;                     // میرایی خطی → درز در چانه ندارد
      const ease = f * f;                           // منحنی نرم‌تر
      const offset = drop * ease;
      const w = stripW * (1 + (stretch - 1) * ease);
      const x = cx - w / 2;

      ctx.drawImage(
        this.base,                                   // منبع: بوم پایهٔ بدون تبدیل
        Math.round(sx0), Math.round(y), Math.round(stripW), Math.ceil(sliceH),
        Math.round(x), Math.round(y + offset), Math.round(w), Math.ceil(sliceH) + 1
      );
    }
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('بارگذاری تصویر آواتار ناموفق بود: ' + src));
    im.src = src;
  });
}
