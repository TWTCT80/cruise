// Hidden tuning panel. Open: three-finger tap (phone) or "D" key (desktop).
// Every slider edits `config` live. "Kopiera" copies the changed values as
// JSON so they can be pasted back into config.js defaults.

import { config, DEFAULTS, RANGES, saveConfig, resetConfig, diffFromDefaults } from './config.js';
import { OUTFIT_PRESETS, GARMENTS, garmentColor } from './outfit.js';
import { VERSION } from './version.js';

export function createDevPanel(getStats) {
  const el = document.getElementById('dev');
  const body = el.querySelector('.dev-body');
  const stats = el.querySelector('.dev-stats');
  const inputs = {};
  const swatches = {};

  const hexOf = (c) => '#' + c.toString(16).padStart(6, '0');
  function refreshSwatches() {
    for (const g of GARMENTS) if (swatches[g]) swatches[g].style.background = hexOf(garmentColor(g));
  }
  function refreshRow(k) {
    const o = inputs[k];
    o.input.value = config[k]; o.val.textContent = fmt(config[k]);
    o.row.classList.toggle('changed', config[k] !== DEFAULTS[k]);
  }

  for (const key of Object.keys(RANGES)) {
    if (key === 'hoodieHue') {
      // Outfit section: preset buttons + one swatch per garment
      const head = document.createElement('div');
      head.className = 'dev-section';
      head.innerHTML = '<div class="dev-title">Outfit</div><div class="dev-presets"></div>';
      const box = head.querySelector('.dev-presets');
      for (const [name, values] of Object.entries(OUTFIT_PRESETS)) {
        const b = document.createElement('button');
        b.textContent = name;
        b.onclick = () => {
          Object.assign(config, values);
          for (const k of Object.keys(values)) refreshRow(k);
          refreshSwatches(); saveConfig();
        };
        box.appendChild(b);
      }
      body.appendChild(head);
    }
    if (key === 'gravity') {
      const h = document.createElement('div');
      h.className = 'dev-section';
      h.innerHTML = '<div class="dev-title">Känsla, kamera & ljud</div>';
      body.appendChild(h);
    }
    const garment = GARMENTS.find((g) => key === g + 'Hue');
    if (garment) {
      const sw = document.createElement('div');
      sw.className = 'dev-swatch';
      sw.innerHTML = `<span></span>${{ hoodie: 'Tröja', pants: 'Byxor', beanie: 'Mössa' }[garment]}`;
      swatches[garment] = sw.querySelector('span');
      body.appendChild(sw);
    }
    const [min, max, step] = RANGES[key];
    const row = document.createElement('label');
    row.className = 'dev-row';
    row.innerHTML = `<span class="k">${key}</span><input type="range" min="${min}" max="${max}" step="${step}"><span class="v"></span>`;
    const input = row.querySelector('input');
    const val = row.querySelector('.v');
    input.value = config[key];
    val.textContent = fmt(config[key]);
    input.addEventListener('input', () => {
      config[key] = parseFloat(input.value);
      val.textContent = fmt(config[key]);
      row.classList.toggle('changed', config[key] !== DEFAULTS[key]);
      refreshSwatches();
      saveConfig();
    });
    row.classList.toggle('changed', config[key] !== DEFAULTS[key]);
    inputs[key] = { input, val, row };
    body.appendChild(row);
  }

  el.querySelector('[data-act=close]').onclick = () => toggle(false);
  el.querySelector('[data-act=reload]').onclick = () => location.reload();
  el.querySelector('[data-act=reset]').onclick = () => {
    resetConfig();
    for (const k of Object.keys(inputs)) refreshRow(k);
    refreshSwatches();
  };
  el.querySelector('[data-act=copy]').onclick = async (e) => {
    const txt = JSON.stringify(diffFromDefaults(), null, 2);
    try { await navigator.clipboard.writeText(txt); e.target.textContent = 'Kopierat ✓'; }
    catch { prompt('Kopiera:', txt); }
    setTimeout(() => (e.target.textContent = 'Kopiera ändringar'), 1500);
  };

  refreshSwatches();

  let open = false;
  function toggle(v = !open) {
    open = v;
    el.classList.toggle('open', open);
  }

  setInterval(() => { if (open) stats.textContent = `v ${VERSION} · ${getStats()}`; }, 200);

  window.addEventListener('keydown', (e) => { if (e.key === 'd' || e.key === 'D') toggle(); });

  return { toggle, isOpen: () => open };
}

function fmt(v) {
  if (Math.abs(v) < 0.01 && v !== 0) return v.toExponential(1);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
