/**
 * Avatar studio: turn any portrait into a talking avatar profile.
 *
 * The warp renderer needs four numbers it cannot infer reliably from an
 * arbitrary photograph, so this tool has an operator place them in a few
 * seconds: click the lip line, then drag three sliders while watching a
 * live preview. The output is a JSON profile the viewer consumes.
 *
 * Everything runs in the browser. No upload, no face-detection model, no
 * GPU. A museum can onboard a new persona without engineering support.
 */

import { AvatarRenderer } from './avatar.js';
import { AVATARS } from './avatars.js';
import { Speaker } from './tts.js';

const el = (id) => document.getElementById(id);

const state = {
  image: AVATARS[0].image,
  profile: {
    id: 'custom-1',
    name: 'راهنمای موزه',
    role: 'راهنمای هوشمند',
    image: AVATARS[0].image,
    mouth: { ...AVATARS[0].mouth }
  }
};

let renderer = null;
let calImg = null;
let calGeom = null;
let speaker = null;
let testTimer = null;

async function boot() {
  buildPresets();
  bindControls();
  await reload();
  drive();
}

function buildPresets() {
  const box = el('presets');
  for (const a of AVATARS) {
    const b = document.createElement('button');
    b.className = 'face';
    b.style.backgroundImage = `url(${a.image})`;
    b.title = a.name;
    b.onclick = () => {
      state.image = a.image;
      state.profile = { ...state.profile, image: a.image, name: a.name, role: a.role, mouth: { ...a.mouth } };
      syncInputs();
      reload();
    };
    box.appendChild(b);
  }
}

function bindControls() {
  el('file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    // data URL, not object URL: the exported profile stays self-contained
    const fr = new FileReader();
    fr.onload = () => { state.image = fr.result; state.profile.image = fr.result; reload(); };
    fr.readAsDataURL(f);
  });

  for (const key of ['w', 'jaw', 'drop']) {
    el(key).addEventListener('input', () => {
      state.profile.mouth[key] = Number(el(key).value);
      el(key + 'Val').textContent = Number(el(key).value).toFixed(3);
      redrawCalibration();
      exportJson();
    });
  }

  for (const key of ['id', 'name', 'role']) {
    el(key).addEventListener('input', () => { state.profile[key] = el(key).value; exportJson(); });
  }

  el('cal').addEventListener('click', (e) => {
    if (!calGeom) return;
    const r = el('cal').getBoundingClientRect();
    const scale = el('cal').width / r.width;
    const px = (e.clientX - r.left) * scale;
    const py = (e.clientY - r.top) * scale;
    state.profile.mouth.x = clamp((px - calGeom.dx) / calGeom.dw, 0, 1);
    state.profile.mouth.y = clamp((py - calGeom.dy) / calGeom.dh, 0, 1);
    redrawCalibration();
    exportJson();
  });

  el('test').addEventListener('click', testSpeech);
  el('copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(el('json').value);
    el('copy').textContent = 'کپی شد';
    setTimeout(() => { el('copy').textContent = 'کپی JSON'; }, 1400);
  });
  el('use').addEventListener('click', () => {
    localStorage.setItem('museum-avatar-profile', JSON.stringify(state.profile));
    location.href = 'viewer.html?av=' + encodeURIComponent(state.profile.id);
  });

  syncInputs();
}

function syncInputs() {
  const m = state.profile.mouth;
  for (const key of ['w', 'jaw', 'drop']) {
    el(key).value = m[key];
    el(key + 'Val').textContent = Number(m[key]).toFixed(3);
  }
  el('id').value = state.profile.id;
  el('name').value = state.profile.name;
  el('role').value = state.profile.role;
}

async function reload() {
  if (renderer) renderer.stop();
  renderer = new AvatarRenderer(el('preview'), { ...state.profile, idleMotion: true });
  await renderer.load();
  renderer.start();

  calImg = await loadImage(state.profile.image);
  redrawCalibration();
  exportJson();
}

function redrawCalibration() {
  const c = el('cal');
  const ctx = c.getContext('2d');
  const rect = c.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.round(rect.width * dpr);
  c.height = Math.round(rect.height * dpr);

  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  if (!calImg) return;

  const s = Math.min(W / calImg.width, H / calImg.height);   // contain, so nothing is cropped
  const dw = calImg.width * s, dh = calImg.height * s;
  const dx = (W - dw) / 2, dy = (H - dh) / 2;
  calGeom = { dx, dy, dw, dh };
  ctx.drawImage(calImg, dx, dy, dw, dh);

  const m = state.profile.mouth;
  const cx = dx + m.x * dw, cy = dy + m.y * dh;
  const mw = m.w * dw, jaw = m.jaw * dh;

  ctx.save();
  ctx.strokeStyle = '#FFC566';
  ctx.lineWidth = 2 * dpr;
  ctx.strokeRect(cx - mw / 2, cy, mw, jaw);            // jaw region
  ctx.beginPath();
  ctx.moveTo(cx - mw / 2, cy);
  ctx.lineTo(cx + mw / 2, cy);
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 3 * dpr;
  ctx.stroke();                                        // lip line
  ctx.restore();
}

/** Preview loop: real speech when available, otherwise a synthetic envelope. */
function drive() {
  const loop = () => {
    if (renderer) {
      if (speaker && speaker.driver) {
        const m = speaker.readMouth();
        renderer.setMouth(m.open, m.spread);
      } else if (testTimer) {
        const t = performance.now() / 1000;
        renderer.setMouth(
          clamp(0.45 + Math.sin(t * Math.PI * 4.5) * 0.4 + Math.sin(t * 13) * 0.12, 0, 1),
          clamp(0.5 + Math.sin(t * 1.6) * 0.35, 0, 1)
        );
      } else {
        renderer.setMouth(0, 0.5);
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

async function testSpeech() {
  const text = el('sample').value.trim() || 'سلام، به موزه خوش آمدید.';
  if (!speaker) {
    const { CONFIG } = await import('./config.js');
    speaker = new Speaker(CONFIG.tts, 'fa');
    await speaker.unlock();
  }
  // Animate regardless of whether a Persian voice exists on this machine,
  // so calibration is still possible on a desktop with no fa-IR voice.
  testTimer = true;
  await speaker.speak(text);
  testTimer = false;
}

function exportJson() {
  el('json').value = JSON.stringify(trimProfile(state.profile), null, 2);
}

/** Data-URL images are huge; show a placeholder instead of dumping base64. */
function trimProfile(p) {
  const out = { ...p, mouth: { ...p.mouth } };
  for (const k of ['x', 'y', 'w', 'jaw', 'drop']) out.mouth[k] = round(out.mouth[k]);
  if (String(out.image).startsWith('data:')) out.image = '<< data URL of the uploaded photo >>';
  return out;
}

const round = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image load failed'));
    im.src = src;
  });
}

boot();
