// Hidden tuning panel. Open: three-finger tap (phone) or "D" key (desktop).
// Every slider edits `config` live. "Kopiera" copies the changed values as
// JSON so they can be pasted back into config.js defaults.

import { config, DEFAULTS, RANGES, saveConfig, resetConfig, diffFromDefaults } from './config.js';

export function createDevPanel(getStats) {
  const el = document.getElementById('dev');
  const body = el.querySelector('.dev-body');
  const stats = el.querySelector('.dev-stats');
  const inputs = {};

  for (const key of Object.keys(RANGES)) {
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
      saveConfig();
    });
    row.classList.toggle('changed', config[key] !== DEFAULTS[key]);
    inputs[key] = { input, val, row };
    body.appendChild(row);
  }

  el.querySelector('[data-act=close]').onclick = () => toggle(false);
  el.querySelector('[data-act=reset]').onclick = () => {
    resetConfig();
    for (const [k, o] of Object.entries(inputs)) {
      o.input.value = config[k]; o.val.textContent = fmt(config[k]); o.row.classList.remove('changed');
    }
  };
  el.querySelector('[data-act=copy]').onclick = async (e) => {
    const txt = JSON.stringify(diffFromDefaults(), null, 2);
    try { await navigator.clipboard.writeText(txt); e.target.textContent = 'Kopierat ✓'; }
    catch { prompt('Kopiera:', txt); }
    setTimeout(() => (e.target.textContent = 'Kopiera ändringar'), 1500);
  };

  let open = false;
  function toggle(v = !open) {
    open = v;
    el.classList.toggle('open', open);
  }

  setInterval(() => { if (open) stats.textContent = getStats(); }, 200);

  window.addEventListener('keydown', (e) => { if (e.key === 'd' || e.key === 'D') toggle(); });

  return { toggle, isOpen: () => open };
}

function fmt(v) {
  if (Math.abs(v) < 0.01 && v !== 0) return v.toExponential(1);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
