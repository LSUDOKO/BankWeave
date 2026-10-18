// Shared deterministic animation helpers for BankWeave clips. Each segment defines SEG = {dur, build(stage), update(t)}.
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const io = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const sio = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const eout = x => 1 - Math.pow(1 - x, 3);
const lin = x => x;
const lerp = (a, b, x) => a + (b - a) * x;
function kf(t, pts, ease = io) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) {
    const x = ease(prog(t, pts[i - 1][0], pts[i][0])), a = pts[i - 1][1], b = pts[i][1];
    return Array.isArray(a) ? a.map((v, j) => lerp(v, b[j], x)) : lerp(a, b, x);
  }
  return pts[pts.length - 1][1];
}
const $ = id => document.getElementById(id);
function el(tag, attrs = {}, html = '') { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'style') e.style.cssText = v; else e.setAttribute(k, v); } e.innerHTML = html; return e; }

// browser-chrome window. returns {root, vp}
function makeWin(parent, { id, url, x, y, w, h, dark = false }) {
  const root = el('div', { id, class: 'win' + (dark ? ' dark' : ''), style: `left:${x}px;top:${y}px;width:${w}px` });
  root.innerHTML = `<div class="bar"><span class="dots"><i></i><i></i><i></i></span><div class="url"><svg viewBox="0 0 16 16" width="15" height="15"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="7" width="10" height="7" rx="1.6" fill="currentColor"/></svg><span>${url}</span></div></div><div class="vp" style="height:${h}px"></div>`;
  parent.appendChild(root);
  return { root, vp: root.querySelector('.vp'), w, h };
}
// image inside a viewport with a camera [x, y, zoom] in image px
function makeImg(vp, src, cls = '') { const i = el('img', { src, class: 'cam ' + cls }); vp.appendChild(i); return i; }
function cam(img, x, y, z) { img.style.transform = `scale(${z}) translate(${-x}px, ${-y}px)`; }
// scene visibility: fade in over [a, a+f]; hidden after b + f
function vis(node, t, a, b, f = .4) {
  const o = t < a ? 0 : t > b + f ? 0 : prog(t, a, a + f);
  node.style.opacity = o; node.style.visibility = o > 0 ? 'visible' : 'hidden';
  return o;
}
// floating label pill
function makeLabel(parent, id, html, style = '') { const l = el('div', { id, class: 'lab', style }, `<b></b><span>${html}</span>`); parent.appendChild(l); return l; }
function showLabel(l, t, a, b) {
  const i = eout(prog(t, a, a + .45)), o = prog(t, b - .35, b);
  l.style.opacity = i * (1 - o); l.style.transform = `translate(-50%, ${(1 - i) * 24 + o * 10}px)`;
}
// cursor + click ripple
function makeCursor(vp) {
  const c = el('div', { class: 'cursor' }, `<div class="rip"></div><svg width="34" height="40" viewBox="0 0 17 20"><path d="M1 1 L1 16 L5 12.4 L8 19 L10.6 17.8 L7.7 11.4 L13 11.4 Z" fill="#0b1b33" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>`);
  vp.appendChild(c); return c;
}
function placeCursor(c, t, path, clicks = [], show = [0, 1e9]) {
  const [x, y] = kf(t, path, sio);
  c.style.left = x + 'px'; c.style.top = y + 'px';
  c.style.opacity = t < show[0] || t > show[1] ? 0 : Math.min(prog(t, show[0], show[0] + .25), 1 - prog(t, show[1] - .25, show[1]));
  const r = c.querySelector('.rip'); let rs = 0, ro = 0;
  for (const k of clicks) if (t >= k && t < k + .6) { const q = prog(t, k, k + .6); rs = .3 + q * 1.4; ro = 1 - q; }
  r.style.transform = `translate(-50%,-50%) scale(${rs})`; r.style.opacity = ro;
  const press = clicks.some(k => t >= k && t < k + .12); c.querySelector('svg').style.transform = press ? 'scale(.85)' : 'none';
}
// highlight ring (in viewport coordinates)
function makeRing(vp, cls = '') { const r = el('div', { class: 'ring ' + cls }); vp.appendChild(r); return r; }
function placeRing(r, t, a, b, [x, y, w, h]) {
  const i = eout(prog(t, a, a + .4)), o = prog(t, b - .3, b);
  r.style.cssText += `;left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  r.style.opacity = i * (1 - o); r.style.transform = `scale(${1.08 - .08 * i})`;
}
// GIF frame selection: frames = [[t, src], ...]; returns src at source time s
function gifAt(frames, s, skip = []) { let cur = frames[0][1]; for (let i = 0; i < frames.length; i++) if (frames[i][0] <= s && !skip.includes(i)) cur = frames[i][1]; return cur; }
function setSrc(img, src) { if (img.getAttribute('src') !== src) img.setAttribute('src', src); }

window.seek = async t => { SEG.update(t); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); };
window.addEventListener('load', async () => {
  SEG.build($('stage'));
  if (SEG.preload) for (const s of SEG.preload) { const i = new Image(); i.src = s; await i.decode().catch(() => 0); }
  await document.fonts.ready; SEG.update(0); window.ready = true;
});
