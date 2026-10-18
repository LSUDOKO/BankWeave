/* shared helpers for the BankWeave films: everything is a pure function of absolute time t */
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };
const el = (html, parent) => { const d = document.createElement('div'); d.innerHTML = html.trim(); const e = d.firstChild; parent && parent.appendChild(e); return e; };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const E = {
  lin: t => t,
  inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  out: t => 1 - Math.pow(1 - t, 3),
  outQ: t => 1 - Math.pow(1 - t, 5),
  in: t => t * t * t,
  in2: t => t * t,
  sine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  expo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
};
const P = (t, a, b, e = E.inOut) => e(clamp((t - a) / (b - a)));
/* critically damped spring, no overshoot */
const spring = (t, a, w = 14) => { const x = Math.max(0, t - a); return 1 - (1 + w * x) * Math.exp(-w * x); };
const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const mixc = (c1, c2, t) => { const a = c1.match(/\w\w/g).map(h => parseInt(h, 16)), b = c2.match(/\w\w/g).map(h => parseInt(h, 16)); return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`; };
/* characters typed on a 30 fps grid: n chars after `start`, `cps` chars per second */
const typed = (s, t, start, cps = 30) => s.slice(0, clamp(Math.floor((t - start) * cps), 0, s.length));
const caret = (t, on) => on && (Math.floor(t * 2.5) % 2 === 0) ? '<span class="caret"></span>' : '';
/* text rising out of a mask line */
const rise = (node, t, a, d = .5, dist = 1.1) => { const k = P(t, a, a + d, E.outQ); node.style.transform = `translateY(${(1 - k) * dist * 100}%)`; return k; };
/* directional motion blur: per-element SVG filter driven by velocity (px per frame) */
function blurFilter(id) {
  let defs = $('fxdefs');
  if (!defs) { const s = mk('svg', { id: 'fxsvg', width: 0, height: 0, style: 'position:absolute;width:0;height:0' }, document.body); defs = mk('defs', { id: 'fxdefs' }, s); }
  const f = mk('filter', { id, x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
  return mk('feGaussianBlur', { stdDeviation: '0 0' }, f);
}
function setBlur(node, fe, id, vx, vy) {
  const bx = Math.min(Math.abs(vx) * .32, 26), by = Math.min(Math.abs(vy) * .32, 26);
  if (bx < .35 && by < .35) { node.style.filter = 'none'; return; }
  fe.setAttribute('stdDeviation', `${bx.toFixed(2)} ${by.toFixed(2)}`); node.style.filter = `url(#${id})`;
}
const FDT = 1 / 30;
