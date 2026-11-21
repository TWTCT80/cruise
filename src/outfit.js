// Rider outfit from HSL sliders (dev panel). Each garment has hue (0–360),
// saturation (0–1) and lightness (0–1); the shadow-side shade is derived.
// Drawstrings and shoes stay off-white so a dark outfit still reads.

import { config } from './config.js';

export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const to = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255);
  return (to(f(0)) << 16) | (to(f(8)) << 8) | to(f(4));
}

export const GARMENTS = ['hoodie', 'pants', 'beanie'];

export const OUTFIT_PRESETS = {
  Original: { hoodieHue: 173, hoodieSat: 0.58, hoodieLight: 0.39, pantsHue: 234, pantsSat: 0.2, pantsLight: 0.3, beanieHue: 12, beanieSat: 0.76, beanieLight: 0.61 },
  Svart:    { hoodieHue: 230, hoodieSat: 0.08, hoodieLight: 0.1, pantsHue: 230, pantsSat: 0.08, pantsLight: 0.08, beanieHue: 230, beanieSat: 0.08, beanieLight: 0.12 },
  'Svart/röd': { hoodieHue: 230, hoodieSat: 0.08, hoodieLight: 0.1, pantsHue: 230, pantsSat: 0.08, pantsLight: 0.08, beanieHue: 6, beanieSat: 0.7, beanieLight: 0.5 },
  Sand:     { hoodieHue: 30, hoodieSat: 0.25, hoodieLight: 0.72, pantsHue: 220, pantsSat: 0.15, pantsLight: 0.2, beanieHue: 25, beanieSat: 0.35, beanieLight: 0.3 },
};

export function garmentColor(name, shade = 1) {
  const h = config[name + 'Hue'], s = config[name + 'Sat'], l = config[name + 'Light'];
  return hsl(h, s, l * shade);
}

export function outfitKey() {
  return GARMENTS.map((g) => `${config[g + 'Hue']},${config[g + 'Sat']},${config[g + 'Light']}`).join('|');
}

export function outfitColors() {
  const lift = (name) => {
    const l = config[name + 'Light'];
    return hsl(config[name + 'Hue'], config[name + 'Sat'], Math.min(0.85, l + 0.14 + (1 - l) * 0.1));
  };
  return {
    hoodie: garmentColor('hoodie'),
    hoodieDark: garmentColor('hoodie', 0.77),
    hoodieRim: lift('hoodie'),
    pants: garmentColor('pants'),
    pantsDark: garmentColor('pants', 0.77),
    beanie: garmentColor('beanie'),
    beanieDark: garmentColor('beanie', 0.83),
  };
}
