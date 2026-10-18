// Tiny whiteboard renderer: boxes, arrows and handwriting on grid paper, wobbly via an SVG displacement filter.
const C = { ink: '#1f2a3a', blue: '#087cf8', red: '#d93a3f', green: '#0c9466', amber: '#c97a06', grey: '#5b6b80', navy: '#0b2a5b' };
function board({ w = 1600, h = 900, title, sub, boxes = [], arrows = [], notes = [], marks = [], charts = [] }) {
  const svg = [], html = [];
  const B = Object.fromEntries(boxes.map(b => [b.id, b]));
  const anchor = (b, side) => side === 'r' ? [b.x + b.w, b.y + b.h / 2] : side === 'l' ? [b.x, b.y + b.h / 2] : side === 't' ? [b.x + b.w / 2, b.y] : [b.x + b.w / 2, b.y + b.h];
  for (const b of boxes) {
    const col = C[b.color || 'ink'];
    svg.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r ?? 12}" stroke="${col}" stroke-width="${b.sw || 3}" fill="${b.fill || 'none'}" ${b.dash ? 'stroke-dasharray="10 8"' : ''}/>`);
    if (b.title) html.push(`<div class="t" style="left:${b.x + 14}px;top:${b.y + 6}px;width:${b.w - 24}px;font-size:${b.ts || 32}px;color:${col}">${b.title}</div>`);
    if (b.lines) html.push(`<div class="t l" style="left:${b.x + 16}px;top:${b.y + (b.title ? (b.ts || 32) + 14 : 12)}px;width:${b.w - 28}px;font-size:${b.ls || 25}px">${b.lines.join('<br>')}</div>`);
  }
  for (const a of arrows) {
    let [x1, y1] = anchor(B[a.from], a.fs || 'r'), [x2, y2] = anchor(B[a.to], a.ts || 'l');
    if (a.fy != null) y1 = a.fy; if (a.ty != null) y2 = a.ty; if (a.fx != null) x1 = a.fx; if (a.tx != null) x2 = a.tx;
    const col = C[a.color || 'ink'];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + (a.bend || 0);
    svg.push(`<path d="M${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}" stroke="${col}" stroke-width="${a.sw || 3}" fill="none" marker-end="url(#ah-${a.color || 'ink'})" ${a.dash ? 'stroke-dasharray="9 7"' : ''}/>`);
    if (a.label) html.push(`<div class="t" style="left:${mx + (a.lx || 0)}px;top:${my + (a.ly || -36)}px;transform:translateX(-50%);white-space:nowrap;background:#fbfaf6;padding:0 4px;font-size:${a.lsz || 24}px;color:${col}">${a.label}</div>`);
  }
  for (const m of marks) svg.push(m);
  // hand-drawn horizontal bar charts: {x, y, w, label, rows: [[name, value, text, color]], max, log, rowH}
  for (const ch of charts) {
    const rowH = ch.rowH || 46, lw = ch.lw || 300, bw = ch.w - lw - (ch.vw || 110);
    if (ch.label) html.push(`<div class="t" style="left:${ch.x}px;top:${ch.y - 40}px;font-size:26px;color:${C.grey}">${ch.label}</div>`);
    ch.rows.forEach(([name, v, txt, col], i) => {
      const y = ch.y + i * rowH, f = ch.log ? Math.max(0.02, (Math.log10(v) - Math.log10(ch.min)) / (Math.log10(ch.max) - Math.log10(ch.min))) : v / ch.max;
      const c = C[col || 'blue'];
      svg.push(`<rect x="${ch.x + lw}" y="${y}" width="${bw}" height="${rowH - 18}" rx="7" stroke="${C.grey}" stroke-opacity=".35" stroke-width="2" fill="none"/>`);
      svg.push(`<rect x="${ch.x + lw}" y="${y}" width="${Math.max(6, bw * f)}" height="${rowH - 18}" rx="7" stroke="${c}" stroke-width="3" fill="${c}" fill-opacity=".85"/>`);
      html.push(`<div class="t l" style="left:${ch.x}px;top:${y - 2}px;width:${lw - 12}px;text-align:right;font-size:${ch.fs || 25}px">${name}</div>`);
      html.push(`<div class="t" style="left:${ch.x + lw + bw * f + 10}px;top:${y - 4}px;font-size:${(ch.fs || 25) + 2}px;color:${c}">${txt}</div>`);
    });
  }
  for (const n of notes) html.push(`<div class="t" style="left:${n.x}px;top:${n.y}px;${n.w ? `width:${n.w}px;` : ''}font-size:${n.s || 28}px;color:${C[n.c || 'ink']};${n.center ? 'text-align:center;' : ''}">${n.t}</div>`);
  const markers = Object.entries(C).map(([k, v]) => `<marker id="ah-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 L10 5 L0 10" fill="none" stroke="${v}" stroke-width="2"/></marker>`).join('');
  document.body.innerHTML = `<div class="paper"></div>
  <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${markers}
  <filter id="r" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="4"/></filter></defs>
  <g filter="url(#r)" stroke-linecap="round" stroke-linejoin="round">${svg.join('')}</g></svg>
  <div class="t" style="left:56px;top:22px;font-size:54px;color:${C.navy}">${title}</div>
  ${sub ? `<div class="t" style="left:58px;top:88px;font-size:28px;color:${C.grey}">${sub}</div>` : ''}
  ${html.join('')}`;
  document.body.style.width = w + 'px'; document.body.style.height = h + 'px';
}
