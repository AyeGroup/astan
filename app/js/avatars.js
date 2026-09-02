/**
 * Avatar registry.
 *
 * Each profile carries the calibration the warp renderer needs. All mouth
 * values are fractions of the drawn image, never pixels, so the same
 * profile works on any screen size and any source resolution.
 *
 *   x, y  centre of the lip line
 *   w     width of the warped strip
 *   jaw   height of the jaw region, from the lip line down to the chin
 *   drop  maximum jaw travel at full openness
 *
 * A museum that uploads its own photograph produces one of these objects
 * in app/studio.html and pastes it into window.MUSEUM_CONFIG.
 */

export const AVATARS = [
  {
    id: 'mehrbanoo',
    name: 'مهربانو',
    role: 'راهنمای موزه',
    image: 'avatars/mehrbanoo.svg',
    mouth: { x: 0.500, y: 0.663, w: 0.200, jaw: 0.152, drop: 0.042 },
    voiceHint: { fa: 'female', pitch: 1.05 }
  },
  {
    id: 'ostad',
    name: 'استاد',
    role: 'کارشناس تاریخ',
    image: 'avatars/ostad.svg',
    mouth: { x: 0.500, y: 0.663, w: 0.200, jaw: 0.152, drop: 0.042 },
    voiceHint: { fa: 'male', pitch: 0.92 }
  },
  {
    id: 'kimia',
    name: 'کیمیا',
    role: 'راهنمای کودک و نوجوان',
    image: 'avatars/kimia.svg',
    mouth: { x: 0.500, y: 0.663, w: 0.200, jaw: 0.152, drop: 0.042 },
    voiceHint: { fa: 'female', pitch: 1.12 }
  }
];

export function getAvatar(id) {
  return AVATARS.find(a => a.id === id) || AVATARS[0];
}

/** A custom profile exported from the studio wins over the built-ins. */
export function resolveAvatar(id) {
  const custom = window.MUSEUM_CONFIG && window.MUSEUM_CONFIG.customAvatar;
  if (custom && (!id || custom.id === id)) return custom;
  try {
    const saved = JSON.parse(localStorage.getItem('museum-avatar-profile') || 'null');
    if (saved && saved.id === id) return saved;
  } catch { /* ignore malformed local state */ }
  return getAvatar(id);
}
